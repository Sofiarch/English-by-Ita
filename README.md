# English by Ita (web)

Upload an English graded reader as a PDF. Gemini reads the story, splits it
into chapters, and picks the key words (المفردات) for each chapter with an
Arabic translation, a simple English definition, and the sentence from the
story. Save words and review them with spaced-repetition flashcards.

## Setup

1. **Install:** `npm install`
2. **Keys:** copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase dashboard → Connect
   - `GEMINI_API_KEY` — https://aistudio.google.com (server-only, never add `VITE_`)
3. **Database:** Supabase dashboard → SQL Editor → New query → paste
   `supabase/schema.sql` → Run. Creates the tables, row-level security, and
   the private `book-media` storage bucket. Safe to re-run.
   Already set up before covers/bookmarks existed? Run
   `supabase/migrations/002_covers_progress_bookmarks.sql` too.
4. **Run:** `npm run dev` → http://localhost:3000

Optional: Supabase → Authentication → Sign In / Providers → Email — turn off
"Confirm email" while developing so new accounts can log in immediately.

## Offline

The site is offline-first:

- Everything (books, word lists, saved words, progress, bookmarks, PDFs,
  audio, covers, past translations) is stored on the device in IndexedDB —
  one database per account. Pages read from there, so they work with no
  internet.
- Changes are saved on the device and queued; the queue syncs to Supabase
  whenever there's a connection, and changes from other devices are pulled
  in. The header badge shows offline / waiting / synced.
- A service worker caches the app itself, so it opens offline and can be
  installed. Test this with `npm run build && npm start` (the dev server
  doesn't register the service worker).
- Needs internet: adding a book, re-reading one, new word lists, and
  translating a word that was never tapped before (all use Gemini).

Code: `src/lib/localdb.js` (IndexedDB), `src/lib/sync.js` (outbox + pull),
`src/lib/data.js` (what pages call).

## How it fits together

```
browser (React, Vite, Tailwind)          server/ (Express, holds GEMINI_API_KEY)
  ├─ Supabase Auth / DB / Storage  ←→  Supabase
  └─ POST /api/extract  (PDF)      →   Gemini reads PDF → chapters
     POST /api/vocab    (chapters) →   Gemini picks words per chapter
     POST /api/translate (word)    →   Gemini translates a tapped word
```

The `/api` routes only accept requests carrying a valid Supabase session, so
strangers can't spend your Gemini quota.

| Path | What it does |
|---|---|
| `server/gemini.js` | Prompts + JSON schemas for the three Gemini calls, retries when Gemini is busy |
| `src/lib/data.js` | All Supabase reads/writes and the import pipeline |
| `src/components/VocabList.jsx` | The مفردات word list |
| `src/components/Reader.jsx` | Chapter text, tap any word to translate |
| `src/pages/Review.jsx` | Flashcards (SM-2) |
| `supabase/schema.sql` | Tables: `books`, `book_chapters`, `book_words`, `saved_words`, `reading_progress` |

## Deploy to Vercel

The project is ready for Vercel as-is:

- `vite build` → static site in `dist/` (served from Vercel's CDN)
- `api/index.js` → one Node.js function running the Express API (`server/app.js`)
- `vercel.json` → routes `/api/*` to the function, everything else to the
  single-page app, sets a 300 s function limit (enough on every plan), and
  keeps `sw.js` uncached so app updates arrive.

Steps:

1. **Push the folder to GitHub** (and import it at vercel.com/new), or run
   `npx vercel` in this folder. `.env` is never uploaded (`.gitignore`,
   `.vercelignore`).
2. **Environment variables** — Vercel → Project → Settings → Environment
   Variables, for Production *and* Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
   (The `VITE_` ones are built into the site, so redeploy after changing them.)
3. **Supabase → Authentication → URL Configuration**: set *Site URL* to your
   Vercel address (e.g. `https://english-by-ita.vercel.app`) and add it under
   *Redirect URLs*, so sign-up confirmation emails link to the live site.
4. Make sure `supabase/migrations/002_…` and `003_…` have been run.

Notes:

- PDFs never pass through the function (Vercel caps request bodies at 4.5 MB):
  the browser uploads to Supabase Storage and the API downloads the file
  as the signed-in user.
- Reading a big book can take 1–2½ minutes when Gemini is busy; the 300 s limit
  covers that. On Vercel Pro you can raise `maxDuration` in `vercel.json` to 800.
- Rate limits are per function instance on Vercel — a speed bump, not a quota.

## Run the production build locally

`npm run build && npm start` serves `dist/` and the API from one Node process
(this is also how to test the offline service worker).
# English-by-Ita
