import { GoogleGenAI } from "@google/genai";
import { getLevel } from "../src/lib/levels.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const FAST_MODEL = process.env.GEMINI_FAST_MODEL || "gemini-3.1-flash-lite";
const FALLBACK_MODEL = "gemini-flash-latest";

// PDFs up to this size are sent inline; bigger ones go through the Files API
// (Gemini's inline request limit is ~20 MB including the prompt).
const INLINE_PDF_LIMIT = 18 * 1024 * 1024;
const MAX_VOCAB_INPUT_CHARS = 400_000;

let client = null;
function ai() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw httpError(500, "no_key", "GEMINI_API_KEY is missing from .env");
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/** An error the API returns as { error, code }; the site translates `code`. */
export function httpError(status, code, message = code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBusyError(err) {
  const msg = String(err?.message || "");
  return [429, 500, 503].includes(err?.status) || /"code":\s*(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg);
}

function isAuthError(err) {
  const msg = String(err?.message || "");
  return err?.status === 401 || err?.status === 403 || /API key not valid|PERMISSION_DENIED|API_KEY_INVALID/i.test(msg);
}

/** Calls Gemini with a JSON schema, trying each model in order until one works. */
async function generateJson({ models, parts, schema, maxOutputTokens = 8192, thinking }) {
  let lastErr;
  for (const [i, model] of models.entries()) {
    // Retry the same model a couple of times when Google says it's busy (503/429).
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(attempt * 4000);
      try {
        const res = await ai().models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            maxOutputTokens,
            temperature: 0.2,
            // Only the primary model gets a thinking level; fallbacks use their
            // defaults in case they don't support this setting.
            ...(thinking && i === 0 ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
          },
        });
        const text = res.text;
        if (!text) throw new Error(`Empty response from ${model}`);
        return JSON.parse(text);
      } catch (err) {
        lastErr = err;
        console.warn(`[gemini] ${model} attempt ${attempt + 1} failed:`, String(err?.message || err).slice(0, 200));
        if (isAuthError(err)) throw httpError(500, "bad_key", "Gemini API key is not valid");
        if (!isBusyError(err)) break; // other errors: move on to the next model
      }
    }
  }
  if (isBusyError(lastErr)) throw httpError(503, "busy", "Gemini is busy, try again shortly");
  throw httpError(502, "gemini_failed", `Gemini error: ${lastErr?.message || "unknown"}`);
}

async function pdfToPart(buffer) {
  if (buffer.length <= INLINE_PDF_LIMIT) {
    return { part: { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } }, cleanup: async () => {} };
  }
  let file = await ai().files.upload({
    file: new Blob([buffer], { type: "application/pdf" }),
    config: { mimeType: "application/pdf" },
  });
  for (let i = 0; file.state === "PROCESSING" && i < 90; i++) {
    await sleep(2000);
    file = await ai().files.get({ name: file.name });
  }
  if (file.state !== "ACTIVE") throw httpError(502, "gemini_pdf", "Gemini could not process the PDF");
  return {
    part: { fileData: { fileUri: file.uri, mimeType: file.mimeType || "application/pdf" } },
    cleanup: () => ai().files.delete({ name: file.name }).catch(() => {}),
  };
}

// ─────────────────────────────────────────────
// 1. Read the story out of a PDF
// ─────────────────────────────────────────────

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    author: { type: "string" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" } },
        required: ["title", "text"],
      },
    },
  },
  required: ["title", "chapters"],
};

const EXTRACT_PROMPT = `This PDF is an English graded reader (a simplified storybook for language learners).

Extract ONLY the narrative story text, chapter by chapter, exactly as written.

Skip everything that is not the story: cover, title page, contents, copyright, "about the author", introductions, "before you read" pages, glossary/vocabulary boxes and word lists, activities, exercises, quizzes, projects, answer keys, picture captions that are not part of the narrative, page numbers, running headers and footers.

Formatting rules:
- Separate paragraphs with one blank line. Keep dialogue paragraphs as they are.
- Join words split across lines with a hyphen ("won-\\nderful" → "wonderful").
- Panels or text boxes laid out like a comic: read top-to-bottom, left-to-right.
- Chapter titles go in "title" (e.g. "Chapter 1: The Storm"), not inside "text".
- If the book has no chapters, return a single chapter titled "Story".

Also return the book title and author as printed (author may be empty).`;

export async function extractStory(pdfBuffer) {
  const { part, cleanup } = await pdfToPart(pdfBuffer);
  try {
    const out = await generateJson({
      models: [MODEL, FALLBACK_MODEL],
      parts: [part, { text: EXTRACT_PROMPT }],
      schema: EXTRACT_SCHEMA,
      maxOutputTokens: 65536,
      thinking: "MINIMAL",
    });
    const chapters = (out.chapters || [])
      .map((c) => ({ title: String(c.title || "").trim(), text: String(c.text || "").trim() }))
      .filter((c) => c.text.length > 0);
    if (chapters.length === 0) throw httpError(422, "no_story", "No story text found in the PDF");
    return { title: String(out.title || "").trim(), author: String(out.author || "").trim(), chapters };
  } finally {
    await cleanup();
  }
}

// ─────────────────────────────────────────────
// 2. Pick the key words (مفردات) for each chapter
// ─────────────────────────────────────────────

export const PARTS_OF_SPEECH = ["اسم", "فعل", "صفة", "ظرف", "عبارة", "حرف جر", "أخرى"];

const VOCAB_SCHEMA = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          words: {
            type: "array",
            items: {
              type: "object",
              properties: {
                word: { type: "string" },
                lemma: { type: "string" },
                part_of_speech: { type: "string", enum: PARTS_OF_SPEECH },
                translation: { type: "string" },
                definition: { type: "string" },
                example: { type: "string" },
              },
              required: ["word", "lemma", "part_of_speech", "translation", "definition", "example"],
            },
          },
        },
        required: ["index", "words"],
      },
    },
  },
  required: ["chapters"],
};

export async function pickVocabulary({ level, chapters }) {
  const lv = getLevel(level);
  const book = chapters
    .map((c, i) => `=== CHAPTER index=${i}: ${c.title} ===\n${c.text}`)
    .join("\n\n")
    .slice(0, MAX_VOCAB_INPUT_CHARS);

  const prompt = `You are an English teacher preparing a vocabulary list for Arabic-speaking learners reading a graded reader at CEFR ${lv.cefr} (${lv.label}).

For EACH chapter below, pick the 10–18 words or short phrases a learner at this level most needs to learn to understand that chapter.

Choose:
- words above the learner's level, or key to the plot, or repeated in the chapter
- useful phrasal verbs and fixed expressions (e.g. "look after", "all of a sudden")

Do NOT choose:
- names of people, places, or brands
- very basic words (the, go, house, big, happy…) unless the chapter uses them in an unusual sense
- the same lemma twice in one chapter; avoid repeating a word already listed in an earlier chapter unless it is central again

For each word return:
- word: exactly as it appears in the chapter
- lemma: dictionary form (e.g. "ran" → "run", "children" → "child")
- part_of_speech: one of ${PARTS_OF_SPEECH.join("، ")}
- translation: short Modern Standard Arabic meaning that fits THIS context (1–4 words). Write it WITHOUT tashkeel/diacritics.
- definition: simple English definition, max 12 words
- example: one full sentence copied exactly from the chapter that contains the word

Return one entry per chapter using its index. Order words as they first appear in the chapter.

${book}`;

  const out = await generateJson({
    models: [MODEL, FALLBACK_MODEL],
    parts: [{ text: prompt }],
    schema: VOCAB_SCHEMA,
    maxOutputTokens: 32768,
    thinking: "LOW",
  });

  return (out.chapters || [])
    .filter((c) => Number.isInteger(c.index) && c.index >= 0 && c.index < chapters.length)
    .map((c) => ({ index: c.index, words: verifyWords(c.words || [], chapters[c.index].text) }));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text, word) => new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(text || "");
const sentencesOf = (text) => text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["”’']?|[^.!?]+$/g) || [];

/**
 * Gemini occasionally lists a word that isn't in the chapter, or quotes a
 * sentence that doesn't contain the word. Drop single words that aren't in
 * the text, and swap bad examples for a real sentence from the chapter.
 */
function verifyWords(words, text) {
  const sentences = sentencesOf(text);
  return words
    .filter((w) => w.word && w.translation)
    .filter((w) => w.word.trim().includes(" ") || hasWord(text, w.word.trim()))
    .map((w) => {
      if (hasWord(w.example, w.word)) return w;
      const real = sentences.find((s) => hasWord(s, w.word));
      return { ...w, example: real ? real.trim() : "" };
    });
}

// ─────────────────────────────────────────────
// 3. Translate a single tapped word in context
// ─────────────────────────────────────────────

const TRANSLATE_SCHEMA = {
  type: "object",
  properties: {
    translation: { type: "string" },
    lemma: { type: "string" },
    part_of_speech: { type: "string", enum: PARTS_OF_SPEECH },
  },
  required: ["translation", "lemma", "part_of_speech"],
};

export async function translateWord({ word, sentence }) {
  const prompt = `Translate the English word "${word}" into short Modern Standard Arabic (1–4 words), choosing the meaning that fits this sentence:
"${sentence || word}"
Write the Arabic without tashkeel/diacritics.
Also give the ENGLISH dictionary form of the word as "lemma" (e.g. "ran" → "run", "banks" → "bank") — never Arabic — and its part of speech.`;
  return generateJson({
    models: [FAST_MODEL, MODEL],
    parts: [{ text: prompt }],
    schema: TRANSLATE_SCHEMA,
    maxOutputTokens: 512,
    thinking: "MINIMAL",
  });
}

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// ─────────────────────────────────────────────
// 4. Pronunciation (text-to-speech)
// ─────────────────────────────────────────────

const TTS_MODELS = [process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];
const ttsCache = new Map(); // text → { mime, buffer }; small in-memory cache shared by all users
const TTS_CACHE_MAX = 500;

/** → { mime, buffer } spoken audio of a word or short sentence. */
export async function synthesizeSpeech(text) {
  const key = text.toLowerCase();
  if (ttsCache.has(key)) return ttsCache.get(key);
  let lastErr;
  for (const model of TTS_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(2500);
      try {
        const res = await ai().models.generateContent({
          model,
          // Send only the text: TTS models read any instruction prefix aloud too.
          contents: [{ role: "user", parts: [{ text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          },
        });
        const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (!part) throw new Error(`No audio from ${model}`);
        let mime = part.inlineData.mimeType || "audio/wav";
        let buffer = Buffer.from(part.inlineData.data, "base64");
        if (/L16|pcm/i.test(mime)) {
          buffer = pcmToWav(buffer, Number(mime.match(/rate=(\d+)/)?.[1]) || 24000);
          mime = "audio/wav";
        }
        const out = { mime, buffer };
        if (ttsCache.size >= TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value);
        ttsCache.set(key, out);
        return out;
      } catch (err) {
        lastErr = err;
        console.warn(`[tts] ${model} failed:`, String(err?.message || err).slice(0, 160));
        if (isAuthError(err)) throw httpError(500, "bad_key", "Gemini API key is not valid");
        if (!isBusyError(err)) break;
      }
    }
  }
  if (isBusyError(lastErr)) throw httpError(503, "busy", "Gemini is busy, try again shortly");
  throw httpError(502, "gemini_failed", `TTS error: ${lastErr?.message || "unknown"}`);
}

/** Wraps raw 16-bit mono PCM in a WAV header so browsers can play it. */
function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);              // PCM
  header.writeUInt16LE(1, 22);              // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);              // block align
  header.writeUInt16LE(16, 34);             // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
