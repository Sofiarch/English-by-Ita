// Offline-first sync.
//
//  • Every change is written to IndexedDB first, then queued in the "outbox".
//  • When online, the outbox is pushed to Supabase (oldest first), then fresh
//    data is pulled down so changes from other devices arrive.
//  • Rows with a queued change are never overwritten by a pull, so nothing
//    made offline is lost. Otherwise the server copy wins (last write wins).

import { supabase, BUCKET } from "./supabase.js";
import { openLocal } from "./localdb.js";
import { AppError } from "./i18n.jsx";

let current = null;      // { userId, db }
let dbPromise = null;
let seq = 0;
let flushing = false;
let syncing = null;
let timer = null;

// ─── status (for the header badge) ──────────────────────

let status = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastSyncedAt: null,
  error: null,
  version: 0, // bumps after every pull so pages can refresh
};
const listeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}
export const getStatus = () => status;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── lifecycle ──────────────────────────────────────────

const onOnline = () => { setStatus({ online: true }); syncNow(); };
const onOffline = () => setStatus({ online: false });
const onVisible = () => document.visibilityState === "visible" && syncNow();

export function startLocal(userId) {
  if (current?.userId === userId && dbPromise) return dbPromise;
  stopLocal();
  dbPromise = openLocal(`ita-${userId}`).then(async (db) => {
    current = { userId, db };
    navigator.storage?.persist?.().catch(() => {}); // ask the browser not to evict offline data
    const meta = await db.get("meta", "lastPullAt");
    setStatus({ lastSyncedAt: meta?.value || null });
    await refreshPending();
    return db;
  });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  timer = setInterval(() => syncNow(), 60_000);
  dbPromise.then(() => syncNow());
  return dbPromise;
}

export function stopLocal() {
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  document.removeEventListener("visibilitychange", onVisible);
  clearInterval(timer);
  current?.db.close();
  current = null;
  dbPromise = null;
}

export async function localDb() {
  if (!dbPromise) throw new AppError("login_required");
  return dbPromise;
}

export const currentUserId = () => current?.userId;
export const isOnline = () => navigator.onLine;

export function requireOnline() {
  if (!navigator.onLine) throw new AppError("offline_needed");
}

// ─── outbox ─────────────────────────────────────────────

/**
 * Queue a change for Supabase. One entry per row: a newer change to the same
 * row replaces the older one, so 50 progress saves become one upload.
 *   { table, op: "upsert", id, row, onConflict? }
 *   { table, op: "delete", id, match }
 *   { op: "storage_remove", paths }
 *   { op: "storage_upload", path, contentType }   (the file itself waits in the "files" store)
 */
export async function enqueue(entry) {
  const db = await localDb();
  const key =
    entry.op === "storage_remove" ? `storage:${crypto.randomUUID()}`
      : entry.op === "storage_upload" ? `upload:${entry.path}`
        : `${entry.table}:${entry.id}`;
  await db.put("outbox", { ...entry, key, seq: Date.now() * 1000 + (seq++ % 1000) });
  await refreshPending();
  queueMicrotask(() => flush());
}

async function refreshPending() {
  if (!current) return;
  const all = await current.db.all("outbox");
  setStatus({ pending: all.length });
}

async function pendingKeys() {
  return new Set((await current.db.all("outbox")).map((e) => e.key));
}

const isNetworkError = (err) =>
  !navigator.onLine || /fetch|network|load failed|timed? ?out|ECONN/i.test(String(err?.message || err));

async function apply(entry) {
  if (entry.op === "storage_upload") {
    const file = await current.db.get("files", entry.path);
    if (!file) return; // replaced or removed before it could upload
    const { error } = await supabase.storage.from(BUCKET).upload(entry.path, file.blob, { contentType: entry.contentType || file.type, upsert: true });
    if (error) throw error;
    return;
  }
  if (entry.op === "storage_remove") {
    const { error } = await supabase.storage.from(BUCKET).remove(entry.paths);
    if (error) throw error;
    return;
  }
  if (entry.op === "delete") {
    const { error } = await supabase.from(entry.table).delete().match(entry.match);
    if (error) throw error;
    return;
  }
  // upsert — if the server is missing a newer column (migration not run yet), drop it and retry.
  const row = { ...entry.row };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from(entry.table).upsert(row, entry.onConflict ? { onConflict: entry.onConflict } : undefined);
    if (!error) return;
    const missing = error.message?.match(/Could not find the '([^']+)' column/)?.[1];
    if (missing && missing in row) { delete row[missing]; continue; }
    throw error;
  }
}

export async function flush() {
  if (!current || flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const entries = (await current.db.all("outbox")).sort((a, b) => a.seq - b.seq);
    for (const entry of entries) {
      try {
        await apply(entry);
        // Only remove it if it wasn't replaced by a newer change while uploading.
        const now = await current.db.get("outbox", entry.key);
        if (now?.seq === entry.seq) await current.db.del("outbox", entry.key);
      } catch (err) {
        if (isNetworkError(err)) break; // try again later
        console.warn("[sync] dropped change", entry.key, err?.message);
        setStatus({ error: err?.message || String(err) });
        await current.db.del("outbox", entry.key); // permanent error (e.g. duplicate): don't block the queue
      }
    }
  } finally {
    flushing = false;
    await refreshPending();
  }
}

// ─── pull ───────────────────────────────────────────────

/** Fetches every row, past PostgREST's 1000-row page limit. */
async function selectAll(table, build = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(supabase.from(table).select("*")).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Replace a whole local table with the server copy, keeping rows that have queued changes. */
async function replaceTable(db, table, rows, pending, keyOf = (r) => r.id) {
  const remote = new Set(rows.map(keyOf));
  const local = await db.all(table);
  await db.delMany(table, local.map(keyOf).filter((k) => !remote.has(k) && !pending.has(`${table}:${k}`)));
  await db.putMany(table, rows.filter((r) => !pending.has(`${table}:${keyOf(r)}`)));
}

export async function removeBookLocal(db, book) {
  await db.del("books", book.id);
  await db.delByIndex("book_chapters", "book_id", book.id);
  await db.delByIndex("book_words", "book_id", book.id);
  await db.delByIndex("bookmarks", "book_id", book.id);
  await db.del("reading_progress", book.id);
  const tracks = (book.audio_tracks || []).map((t) => t.path);
  await db.delMany("files", [...new Set([book.pdf_path, book.audio_path, book.cover_path, ...tracks].filter(Boolean))]);
}

async function pull() {
  const db = current.db;
  const pending = await pendingKeys();

  // Books (small) — always the full list, so deletions on other devices show up.
  const books = await selectAll("books");
  const localBooks = new Map((await db.all("books")).map((b) => [b.id, b]));
  const remoteIds = new Set(books.map((b) => b.id));
  for (const lb of localBooks.values()) {
    if (!remoteIds.has(lb.id) && !pending.has(`books:${lb.id}`)) await removeBookLocal(db, lb);
  }

  // Chapters (large text) — only for books that are new or changed.
  const needChapters = [];
  for (const b of books) {
    if (pending.has(`books:${b.id}`)) continue;
    const lb = localBooks.get(b.id);
    const changed = !lb || lb.updated_at !== b.updated_at;
    if (b.status === "ready" && (changed || !(await db.countByIndex("book_chapters", "book_id", b.id)))) needChapters.push(b.id);
  }
  for (const ids of chunk(needChapters, 40)) {
    const rows = await selectAll("book_chapters", (q) => q.in("book_id", ids));
    for (const id of ids) await db.replaceByIndex("book_chapters", "book_id", id, rows.filter((r) => r.book_id === id));
  }
  await db.putMany("books", books.filter((b) => !pending.has(`books:${b.id}`)));

  // Word lists, saved words, bookmarks — small enough to refresh fully.
  await replaceTable(db, "book_words", await selectAll("book_words"), pending);
  await replaceTable(db, "saved_words", await selectAll("saved_words"), pending);
  await replaceTable(db, "bookmarks", await selectAll("bookmarks").catch(() => []), pending);

  // Progress — keep whichever copy is newer.
  const progress = await selectAll("reading_progress").catch(() => []);
  for (const r of progress) {
    if (pending.has(`reading_progress:${r.book_id}`)) continue;
    const local = await db.get("reading_progress", r.book_id);
    if (!local || new Date(r.updated_at) >= new Date(local.updated_at)) await db.put("reading_progress", r);
  }

  // Covers are small — keep them all on the device.
  for (const b of books) {
    if (b.cover_path && !(await db.get("files", b.cover_path))) {
      const { data } = await supabase.storage.from(BUCKET).download(b.cover_path);
      if (data) await db.put("files", { path: b.cover_path, blob: data, type: data.type, cachedAt: Date.now() });
    }
  }

  const now = new Date().toISOString();
  await db.put("meta", { key: "lastPullAt", value: now });
  return now;
}

/** Downloads one book (row, chapters, words) into the device copy. */
export async function pullBook(bookId) {
  const db = await localDb();
  const { data: book, error } = await supabase.from("books").select("*").eq("id", bookId).maybeSingle();
  if (error) throw error;
  if (!book) return null;
  const [chapters, words] = await Promise.all([
    selectAll("book_chapters", (q) => q.eq("book_id", bookId)),
    selectAll("book_words", (q) => q.eq("book_id", bookId)),
  ]);
  await db.replaceByIndex("book_chapters", "book_id", bookId, chapters);
  await db.replaceByIndex("book_words", "book_id", bookId, words);
  await db.put("books", book);
  setStatus({ version: status.version + 1 });
  return book;
}

/** Push queued changes, then pull. Safe to call often; concurrent calls share one run. */
export function syncNow() {
  if (!current || !navigator.onLine) return Promise.resolve();
  if (syncing) return syncing;
  setStatus({ syncing: true, error: null });
  syncing = (async () => {
    try {
      await flush();
      const at = await pull();
      setStatus({ lastSyncedAt: at, version: status.version + 1 });
    } catch (err) {
      if (!isNetworkError(err)) {
        console.warn("[sync]", err);
        setStatus({ error: err?.message || String(err) });
      }
    } finally {
      setStatus({ syncing: false });
      syncing = null;
    }
  })();
  return syncing;
}

/** First run on a device: wait for the initial download before showing an empty shelf. */
export async function ensureInitialSync() {
  const db = await localDb();
  const meta = await db.get("meta", "lastPullAt");
  if (!meta && navigator.onLine) await syncNow();
}
