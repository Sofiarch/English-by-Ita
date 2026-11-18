// Offline-first data layer.
//
// Reads always come from the device (IndexedDB). Writes go to the device
// first and are queued for Supabase (see sync.js). Steps that need Gemini or
// a file upload — importing, re-reading, new word lists — require a
// connection and write to Supabase directly, then copy the result down.

import { supabase, BUCKET } from "./supabase.js";
import { extractStory, pickVocabulary } from "./api.js";
import { schedule } from "./srs.js";
import { AppError } from "./i18n.jsx";
import { imageToJpeg, renderPdfCover } from "./pdfCover.js";
import {
  currentUserId, enqueue, ensureInitialSync, localDb, pullBook, removeBookLocal, requireOnline,
} from "./sync.js";

function check({ data, error }) {
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) throw new AppError("db_missing", error.message);
    if (error.code === "42501" || /permission denied/i.test(error.message)) throw new AppError("db_permission", error.message);
    if (/fetch|network/i.test(error.message) && !navigator.onLine) throw new AppError("offline_needed", error.message);
    throw new Error(error.message);
  }
  return data;
}

function userId() {
  const id = currentUserId();
  if (!id) throw new AppError("login_required");
  return id;
}

const nowIso = () => new Date().toISOString();
const byPosition = (a, b) => a.position - b.position;

// ─── Files (PDF, audio, covers) ─────────────────────────

const objectUrls = new Map();

async function cacheFile(path, blob) {
  if (!path || !blob) return;
  const db = await localDb();
  await db.put("files", { path, blob, type: blob.type, cachedAt: Date.now() });
}

function urlFor(path, blob) {
  if (!objectUrls.has(path)) objectUrls.set(path, URL.createObjectURL(blob));
  return objectUrls.get(path);
}

/**
 * A URL for a stored file: the on-device copy when there is one; otherwise
 * (online) a signed link, and the file is saved to the device in the background.
 */
export async function mediaUrl(path, { cache = true } = {}) {
  if (!path) return null;
  const db = await localDb();
  const hit = await db.get("files", path);
  if (hit) return urlFor(path, hit.blob);
  if (!navigator.onLine) throw new AppError("offline_media");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  if (error) throw new Error(error.message);
  if (cache) {
    supabase.storage.from(BUCKET).download(path).then(({ data: blob }) => blob && cacheFile(path, blob)).catch(() => {});
  }
  return data.signedUrl;
}

export async function isFileOffline(path) {
  if (!path) return false;
  return Boolean(await (await localDb()).get("files", path));
}

async function fileBlob(path) {
  const hit = await (await localDb()).get("files", path);
  if (hit) return hit.blob;
  requireOnline();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new AppError("pdf_missing", error.message);
  await cacheFile(path, data);
  return data;
}

// ─── Books ──────────────────────────────────────────────

/** The book's audio clips in play order (older books: their single audio_path). */
export function bookTracks(book) {
  if (book?.audio_tracks?.length) return book.audio_tracks;
  if (book?.audio_path) return [{ path: book.audio_path, name: book.audio_path.split("/").pop() }];
  return [];
}

const naturalSort = (files) => [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

/** Update a book on the server, skipping columns the database doesn't have yet (migration not run). */
async function updateBookRemote(id, patch) {
  const row = { ...patch };
  for (let i = 0; i < 4; i++) {
    const res = await supabase.from("books").update(row).eq("id", id).select().single();
    const missing = res.error?.message?.match(/Could not find the '([^']+)' column/)?.[1];
    if (missing && missing in row) { delete row[missing]; continue; }
    return check(res);
  }
  return check(await supabase.from("books").update(row).eq("id", id).select().single());
}

async function withCovers(books) {
  const db = await localDb();
  return Promise.all(
    books.map(async (b) => {
      const f = b.cover_path ? await db.get("files", b.cover_path) : null;
      return { ...b, cover_url: f ? urlFor(b.cover_path, f.blob) : null };
    }),
  );
}

export async function listBooks() {
  await ensureInitialSync();
  const books = await (await localDb()).all("books");
  books.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return withCovers(books);
}

export async function getBook(id) {
  await ensureInitialSync();
  let book = await (await localDb()).get("books", id);
  if (!book && navigator.onLine) book = await pullBook(id).catch(() => null);
  return book ? (await withCovers([book]))[0] : null;
}

export async function getChapters(bookId) {
  const db = await localDb();
  let rows = await db.byIndex("book_chapters", "book_id", bookId);
  if (!rows.length && navigator.onLine) {
    await pullBook(bookId).catch(() => {});
    rows = await db.byIndex("book_chapters", "book_id", bookId);
  }
  return rows.sort(byPosition);
}

export async function getBookWords(bookId) {
  return (await (await localDb()).byIndex("book_words", "book_id", bookId)).sort(byPosition);
}

export async function setWordHidden(id, hidden) {
  const db = await localDb();
  const row = await db.get("book_words", id);
  if (!row) return;
  const next = { ...row, hidden };
  await db.put("book_words", next);
  await enqueue({ table: "book_words", op: "upsert", id, row: next });
}

export async function deleteBook(book) {
  const db = await localDb();
  await removeBookLocal(db, book);
  await enqueue({ table: "books", op: "delete", id: book.id, match: { id: book.id } });
  const paths = [...new Set([book.pdf_path, book.audio_path, book.cover_path, ...bookTracks(book).map((t) => t.path)].filter(Boolean))];
  if (paths.length) await enqueue({ op: "storage_remove", paths });
}

// ─── Editing a book (works offline: files upload when back online) ──

const BOOK_COLUMNS = ["id", "user_id", "title", "author", "level", "status", "error", "pdf_path", "audio_path", "audio_tracks", "cover_path",
  "chapter_count", "word_count", "created_at", "updated_at"];
const serverRow = (b) => Object.fromEntries(BOOK_COLUMNS.filter((k) => k in b).map((k) => [k, b[k]]));

async function saveBookRow(next) {
  const db = await localDb();
  const row = serverRow({ ...next, updated_at: nowIso() });
  await db.put("books", row);
  await enqueue({ table: "books", op: "upsert", id: row.id, row });
  return row;
}

/** Stores a file on the device now and queues its upload. Returns the new path. */
async function stageFile(path, blob, contentType) {
  await cacheFile(path, blob);
  objectUrls.delete(path);
  await enqueue({ op: "storage_upload", path, contentType });
  return path;
}

async function dropFile(path) {
  if (!path) return;
  const db = await localDb();
  await db.del("files", path);
  objectUrls.delete(path);
  await enqueue({ op: "storage_remove", paths: [path] });
}

/**
 * Applies edits to a book.
 *   patch:  { title?, author?, level? }
 *   tracks: the new ordered clip list — items are { path, name } (kept) or { file } (new);
 *           undefined leaves the audio alone
 *   cover: image File to use, "pdf" to rebuild from page 1, undefined to leave alone
 * Returns the updated book (with cover_url).
 */
export async function editBook(book, { patch = {}, tracks, cover } = {}) {
  const uid = userId();
  const db = await localDb();
  let next = { ...(await db.get("books", book.id)), ...patch };
  const stamp = Date.now(); // new file names so old copies are never served from a cache

  if (tracks !== undefined) {
    const before = bookTracks(next).map((t) => t.path);
    const list = [];
    for (const [i, item] of tracks.entries()) {
      if (item.file) {
        const path = `${uid}/${book.id}/audio-${stamp}-${i}.${extOf(item.file, "mp3")}`;
        await stageFile(path, item.file, item.file.type || "audio/mpeg");
        list.push({ path, name: item.file.name });
      } else {
        list.push({ path: item.path, name: item.name });
      }
    }
    const kept = new Set(list.map((t) => t.path));
    for (const path of before) if (!kept.has(path)) await dropFile(path);
    next.audio_tracks = list;
    next.audio_path = list[0]?.path || null;
  }

  if (cover !== undefined) {
    const old = next.cover_path;
    const jpeg = cover === "pdf" ? await renderPdfCover(await fileBlob(next.pdf_path)) : await imageToJpeg(cover);
    const path = `${uid}/${book.id}/cover-${stamp}.jpg`;
    await stageFile(path, jpeg, "image/jpeg");
    next.cover_path = path;
    if (old && old !== path) await dropFile(old);
  }

  next = await saveBookRow(next);
  return (await withCovers([next]))[0];
}

// ─── Import pipeline (needs internet: uploads + Gemini) ─

const extOf = (file, fallback) => (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || fallback).toLowerCase();

/**
 * Creates the book, uploads its files, runs Gemini, then copies the finished
 * book onto the device. onStage("upload" | "read" | "words" | "done")
 */
export async function importBook({ pdfFile, audioFiles = [], coverBlob, title, author, level }, onStage = () => {}) {
  requireOnline();
  const uid = userId();
  onStage("upload");

  const book = check(
    await supabase
      .from("books")
      .insert({ title: title?.trim() || pdfFile.name.replace(/\.pdf$/i, ""), author: author?.trim() || null, level, status: "processing" })
      .select()
      .single(),
  );

  try {
    const pdfPath = `${uid}/${book.id}/book.pdf`;
    check(await supabase.storage.from(BUCKET).upload(pdfPath, pdfFile, { contentType: "application/pdf", upsert: true }));
    await cacheFile(pdfPath, pdfFile);

    const tracks = [];
    for (const [i, file] of naturalSort(audioFiles).entries()) {
      const path = `${uid}/${book.id}/audio-${i}.${extOf(file, "mp3")}`;
      check(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "audio/mpeg", upsert: true }));
      await cacheFile(path, file);
      tracks.push({ path, name: file.name });
    }

    const updated = await updateBookRemote(book.id, { pdf_path: pdfPath, audio_path: tracks[0]?.path || null, audio_tracks: tracks });

    // The cover is a nice-to-have: never let it fail the import.
    await saveCover(updated, pdfFile, coverBlob).catch((e) => console.warn("[cover]", e.message));

    await processBook(updated, { keepTitle: Boolean(title?.trim()), keepAuthor: Boolean(author?.trim()) }, onStage);
  } catch (err) {
    await markFailed(book.id, err);
    err.bookId = book.id;
    await pullBook(book.id).catch(() => {});
    throw err;
  }
  await pullBook(book.id);
  return book.id;
}

/** Saves page 1 of the PDF as the cover (uploaded + kept on the device). Returns its URL. */
export async function saveCover(book, pdfBlob, coverBlob) {
  requireOnline();
  const uid = userId();
  const jpeg = coverBlob || (await renderPdfCover(pdfBlob));
  const coverPath = `${uid}/${book.id}/cover.jpg`;
  check(await supabase.storage.from(BUCKET).upload(coverPath, jpeg, { contentType: "image/jpeg", upsert: true }));
  check(await supabase.from("books").update({ cover_path: coverPath }).eq("id", book.id));
  await cacheFile(coverPath, jpeg);
  const db = await localDb();
  const local = await db.get("books", book.id);
  if (local) await db.put("books", { ...local, cover_path: coverPath });
  return urlFor(coverPath, jpeg);
}

/** For books imported before covers existed: render one from the PDF (online only). */
export async function ensureCover(book) {
  if (book.cover_path || !book.pdf_path || !navigator.onLine || !("cover_path" in book)) return null;
  return saveCover(book, await fileBlob(book.pdf_path));
}

/** Re-runs Gemini for a book whose import failed or got interrupted. */
export async function retryBook(book, onStage = () => {}) {
  requireOnline();
  onStage("upload");
  if (!book.pdf_path) throw new AppError("pdf_missing");
  check(await supabase.from("books").update({ status: "processing", error: null }).eq("id", book.id));
  try {
    await processBook(book, { keepTitle: true, keepAuthor: true }, onStage);
  } catch (err) {
    await markFailed(book.id, err);
    await pullBook(book.id).catch(() => {});
    throw err;
  }
  await pullBook(book.id);
}

async function markFailed(bookId, err) {
  // Store the code when there is one so the page can show it in either language.
  await supabase.from("books").update({ status: "failed", error: err?.code ? `code:${err.code}` : String(err?.message || err) }).eq("id", bookId);
}

async function processBook(book, { keepTitle, keepAuthor }, onStage) {
  onStage("read");
  const story = await extractStory(book.pdf_path);

  check(await supabase.from("book_chapters").delete().eq("book_id", book.id));
  const chapters = check(
    await supabase
      .from("book_chapters")
      .insert(story.chapters.map((c, i) => ({ book_id: book.id, position: i, title: c.title || `Chapter ${i + 1}`, body: c.text })))
      .select("id, position, title, body"),
  );

  onStage("words");
  const wordCount = await saveVocabulary(book, chapters);

  check(
    await supabase
      .from("books")
      .update({
        status: "ready",
        error: null,
        title: keepTitle || !story.title ? book.title : story.title,
        author: keepAuthor || !story.author ? book.author : story.author,
        chapter_count: chapters.length,
        word_count: wordCount,
        updated_at: nowIso(),
      })
      .eq("id", book.id),
  );
  onStage("done");
}

async function saveVocabulary(book, unsorted) {
  const chapters = [...unsorted].sort(byPosition);
  const vocab = await pickVocabulary(book.level, chapters.map((c) => ({ title: c.title, text: c.body })));
  const rows = vocab.chapters.flatMap((c) =>
    c.words.map((w, i) => ({
      book_id: book.id,
      chapter_id: chapters[c.index].id,
      position: i,
      word: w.word,
      lemma: (w.lemma || w.word).toLowerCase(),
      part_of_speech: w.part_of_speech,
      translation: w.translation,
      definition: w.definition,
      example: w.example,
    })),
  );
  check(await supabase.from("book_words").delete().eq("book_id", book.id));
  if (rows.length) check(await supabase.from("book_words").insert(rows));
  return rows.length;
}

/** Asks Gemini for a fresh مفردات list from the saved chapters (online only). */
export async function regenerateWords(book) {
  requireOnline();
  const chapters = await getChapters(book.id);
  if (!chapters.length) throw new AppError("no_chapters_saved");
  const count = await saveVocabulary(book, chapters);
  check(await supabase.from("books").update({ word_count: count, updated_at: nowIso() }).eq("id", book.id));
  await pullBook(book.id);
  return count;
}

// ─── Saved words (flashcards) ───────────────────────────

export async function listSavedWords() {
  await ensureInitialSync();
  const db = await localDb();
  const [words, books] = await Promise.all([db.all("saved_words"), db.all("books")]);
  const titles = new Map(books.map((b) => [b.id, b.title]));
  return words
    .map((w) => ({ ...w, books: w.book_id && titles.has(w.book_id) ? { title: titles.get(w.book_id) } : null }))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function countDue() {
  const now = Date.now();
  return (await (await localDb()).all("saved_words")).filter((w) => new Date(w.due_at).getTime() <= now).length;
}

export async function saveWords(words) {
  const uid = userId();
  const db = await localDb();
  const saved = [];
  for (const w of words) {
    const lemma = (w.lemma || w.word).toLowerCase().trim();
    if ((await db.byIndex("saved_words", "lemma", lemma)).length) continue; // already saved
    const row = {
      id: crypto.randomUUID(),
      user_id: uid,
      lemma,
      word: w.word,
      translation: w.translation,
      example: w.example || null,
      book_id: w.book_id || null,
      ease: 2.5,
      interval_days: 0,
      reps: 0,
      lapses: 0,
      due_at: nowIso(),
      last_reviewed_at: null,
      created_at: nowIso(),
    };
    await db.put("saved_words", row);
    await enqueue({ table: "saved_words", op: "upsert", id: row.id, row });
    saved.push(row);
  }
  return saved;
}

export async function unsaveWord(lemma) {
  const db = await localDb();
  for (const row of await db.byIndex("saved_words", "lemma", lemma.toLowerCase().trim())) {
    await db.del("saved_words", row.id);
    await enqueue({ table: "saved_words", op: "delete", id: row.id, match: { id: row.id } });
  }
}

export async function gradeWord(card, quality) {
  const db = await localDb();
  const { books, ...stored } = card; // drop the joined title
  const next = { ...stored, ...schedule(card, quality) };
  await db.put("saved_words", next);
  await enqueue({ table: "saved_words", op: "upsert", id: next.id, row: next });
  return { ...next, books };
}

// ─── Reading progress (automatic) ───────────────────────

/** → { chapter_position, paragraph_index, completed_chapters, last_tab } or null */
export async function getProgress(bookId) {
  return (await (await localDb()).get("reading_progress", bookId)) || null;
}

/** All progress rows, keyed by book id (for the shelf). */
export async function listProgress() {
  const rows = await (await localDb()).all("reading_progress");
  return Object.fromEntries(rows.map((r) => [r.book_id, r]));
}

/** Merges `patch` into this book's progress (saved on the device, synced later). */
export async function saveProgress(bookId, patch) {
  const db = await localDb();
  const prev = (await db.get("reading_progress", bookId)) || {
    user_id: userId(), book_id: bookId, chapter_position: 0, paragraph_index: 0, completed_chapters: [], last_tab: null,
  };
  const row = { ...prev, ...patch, updated_at: nowIso() };
  await db.put("reading_progress", row);
  await enqueue({ table: "reading_progress", op: "upsert", id: bookId, row, onConflict: "user_id,book_id" });
}

// ─── Bookmarks (manual) ─────────────────────────────────

export async function listBookmarks(bookId) {
  const rows = await (await localDb()).byIndex("bookmarks", "book_id", bookId);
  return rows.sort((a, b) => a.chapter_position - b.chapter_position || a.paragraph_index - b.paragraph_index);
}

export async function addBookmark({ book_id, chapter_position, paragraph_index, excerpt }) {
  const row = { id: crypto.randomUUID(), user_id: userId(), book_id, chapter_position, paragraph_index, excerpt, note: null, created_at: nowIso() };
  await (await localDb()).put("bookmarks", row);
  await enqueue({ table: "bookmarks", op: "upsert", id: row.id, row });
  return row;
}

export async function deleteBookmark(id) {
  await (await localDb()).del("bookmarks", id);
  await enqueue({ table: "bookmarks", op: "delete", id, match: { id } });
}

export async function updateBookmarkNote(id, note) {
  const db = await localDb();
  const row = await db.get("bookmarks", id);
  if (!row) return;
  const next = { ...row, note: note || null };
  await db.put("bookmarks", next);
  await enqueue({ table: "bookmarks", op: "upsert", id, row: next });
}

// ─── Quiz pool ──────────────────────────────────────────

/** Words available for quizzes: every visible word from ready books (or one book). */
export async function listQuizPool(bookId) {
  await ensureInitialSync();
  const db = await localDb();
  const books = (await db.all("books")).filter((b) => b.status === "ready");
  const titles = new Map(books.map((b) => [b.id, b.title]));
  const words = bookId ? await db.byIndex("book_words", "book_id", bookId) : await db.all("book_words");
  return {
    books: books.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    words: words
      .filter((w) => !w.hidden && titles.has(w.book_id) && w.word && w.translation)
      .map((w) => ({ ...w, bookTitle: titles.get(w.book_id) })),
  };
}

export { naturalSort };
