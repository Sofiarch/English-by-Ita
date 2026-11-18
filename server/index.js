// Local server: the API from app.js + the site (Vite in dev, dist/ in production).
// On Vercel this file isn't used — see api/index.js and vercel.json.

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import api from "./app.js";
import { supabaseConfigured } from "./auth.js";
import { geminiConfigured } from "./gemini.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(api);

if (isProd) {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

const server = app.listen(PORT, () => {
  console.log(`English by Ita → http://localhost:${PORT}`);
  console.log(`  Gemini key: ${geminiConfigured() ? "found" : "MISSING"} · Supabase: ${supabaseConfigured() ? "found" : "MISSING"}`);
});
// Reading a whole book with Gemini can take a few minutes.
server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 15 * 60 * 1000 + 1000;
