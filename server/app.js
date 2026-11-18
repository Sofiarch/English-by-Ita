// The API (Gemini routes). Used two ways:
//   • locally by server/index.js (which also serves the site), and
//   • on Vercel by api/index.js, as a single serverless function.
//
// Vercel caps request bodies at 4.5 MB, so the PDF is never uploaded here:
// the browser puts it in Supabase Storage first and sends only its path.

import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { downloadUserFile, requireUser, supabaseConfigured } from "./auth.js";
import { extractStory, pickVocabulary, translateWord, synthesizeSpeech, geminiConfigured, httpError } from "./gemini.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));

// Per-user limits. (On Vercel these are per instance — a speed bump, not a hard quota.)
const limiter = (max, minutes = 15) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip,
    validate: false,
    message: { code: "rate_limited", error: "Too many requests" },
  });

// Wraps async handlers so thrown errors reach the error middleware.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, gemini: geminiConfigured(), supabase: supabaseConfigured() });
});

app.post(
  "/api/extract",
  requireUser,
  limiter(15, 60),
  route(async (req, res) => {
    const path = String(req.body?.path || "");
    if (!path) throw httpError(400, "no_file", "No PDF path sent");
    const started = Date.now();
    const pdf = await downloadUserFile(req, path);
    const story = await extractStory(pdf);
    console.log(`[extract] ${story.chapters.length} chapters in ${((Date.now() - started) / 1000).toFixed(1)}s (${(pdf.length / 1048576).toFixed(1)} MB)`);
    res.json(story);
  }),
);

app.post(
  "/api/vocab",
  requireUser,
  limiter(30, 60),
  route(async (req, res) => {
    const { level, chapters } = req.body || {};
    if (!Array.isArray(chapters) || chapters.length === 0) throw httpError(400, "no_chapters", "No chapters sent");
    const clean = chapters.slice(0, 80).map((c) => ({ title: String(c.title || ""), text: String(c.text || "") }));
    res.json({ chapters: await pickVocabulary({ level, chapters: clean }) });
  }),
);

app.post(
  "/api/translate",
  requireUser,
  limiter(300),
  route(async (req, res) => {
    const word = String(req.body?.word || "").trim().slice(0, 60);
    const sentence = String(req.body?.sentence || "").trim().slice(0, 500);
    if (!word) throw httpError(400, "no_word", "No word sent");
    res.json(await translateWord({ word, sentence }));
  }),
);

app.post(
  "/api/tts",
  requireUser,
  limiter(400),
  route(async (req, res) => {
    const text = String(req.body?.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) throw httpError(400, "no_word", "No text sent");
    const { mime, buffer } = await synthesizeSpeech(text);
    res.set({ "Content-Type": mime, "Cache-Control": "private, max-age=31536000" }).send(buffer);
  }),
);

app.use("/api", (_req, res) => res.status(404).json({ code: "not_found", error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error("[api]", err);
  res.status(status).json({ code: err.code || (status === 413 ? "too_large" : "server_error"), error: err.message || "Server error" });
});

export default app;
