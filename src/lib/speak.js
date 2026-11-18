// Pronunciation.
//
// Browser voices are unreliable (on Linux Chrome they often report "spoken"
// while staying silent), so words are spoken with Gemini text-to-speech,
// fetched once and kept on the device — after the first time they play
// instantly and offline. If that fails, the browser voice is tried instead.

import { supabase } from "./supabase.js";
import { localDb } from "./sync.js";

export const canSpeak = true;

const urls = new Map();      // text → object URL
const inFlight = new Map();  // text → Promise<url>
let current = null;          // the <audio> playing now

// v2: clips saved before the fix also contained the spoken instruction — ignore them.
const keyOf = (text) => `tts2:en:${text.toLowerCase().trim()}`;

async function audioUrl(text) {
  const key = keyOf(text);
  if (urls.has(key)) return urls.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    const db = await localDb();
    const hit = await db.get("files", key);
    let blob = hit?.blob;
    if (!blob) {
      if (!navigator.onLine) throw new Error("offline");
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      blob = await res.blob();
      await db.put("files", { path: key, blob, type: blob.type, cachedAt: Date.now() });
    }
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, job);
  return job;
}

/** Download a word's audio ahead of time (e.g. the next quiz question). */
export function preloadSpeech(text) {
  if (text) audioUrl(text).catch(() => {});
}

function browserSpeak(text, rate) {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith("en-US")) || speechSynthesis.getVoices().find((x) => x.lang?.startsWith("en"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/**
 * Speak `text`. Pass the clicked button as `el` to show a loading pulse while
 * the audio is fetched the first time.
 */
export async function speak(text, rate = 1, el = null) {
  if (!text) return;
  current?.pause();
  el?.classList.add("is-loading");
  try {
    const audio = new Audio(await audioUrl(text));
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    current = audio;
    await audio.play();
  } catch {
    browserSpeak(text, rate);
  } finally {
    el?.classList.remove("is-loading");
  }
}
