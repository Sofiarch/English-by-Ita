import { supabase } from "./supabase.js";
import { AppError } from "./i18n.jsx";
import { localDb } from "./sync.js";

async function post(path, { json, form } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body: form || JSON.stringify(json),
    });
  } catch {
    throw new AppError("server_unreachable");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(body.code || "server_error", body.error || `Request failed (${res.status})`);
  return body;
}

/**
 * Gemini reads the PDF → { title, author, chapters: [{ title, text }] }.
 * The PDF is already in Supabase Storage; only its path is sent (keeps requests
 * under hosting body-size limits, e.g. Vercel's 4.5 MB).
 */
export function extractStory(storagePath) {
  return post("/api/extract", { json: { path: storagePath } });
}

/** Gemini picks key words → { chapters: [{ index, words: [...] }] } */
export function pickVocabulary(level, chapters) {
  return post("/api/vocab", { json: { level, chapters } });
}

const inFlight = new Map();

/**
 * → { translation, lemma, part_of_speech }
 * Answers are kept on the device, so a word tapped once translates offline later.
 */
export async function translateWord(word, sentence) {
  const key = `${word.toLowerCase()}|${sentence}`;
  const db = await localDb();
  const exact = await db.get("translations", key);
  if (exact) return exact.value;
  if (!navigator.onLine) {
    // Offline: the same word from another sentence is better than nothing.
    const any = await db.get("translations", `${word.toLowerCase()}|*`);
    if (any) return any.value;
    throw new AppError("offline_needed");
  }
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      post("/api/translate", { json: { word, sentence } })
        .then(async (value) => {
          // Also store a context-free fallback so the same word in another sentence works offline.
          await db.putMany("translations", [{ key, value }, { key: `${word.toLowerCase()}|*`, value }]);
          return value;
        })
        .finally(() => inFlight.delete(key)),
    );
  }
  return inFlight.get(key);
}
