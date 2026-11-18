-- English by Ita (web) — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run. Uses new table names so it never touches the old app's
-- tables (stories, user_progress, saved_vocab, user_settings).

-- ─────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────

create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  author        text,
  level         text not null default 'level1',
  status        text not null default 'processing'
                check (status in ('processing', 'ready', 'failed')),
  error         text,
  pdf_path      text,
  audio_path    text,
  cover_path    text,
  audio_tracks  jsonb not null default '[]'::jsonb,
  chapter_count int  not null default 0,
  word_count    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Added after the first release: page 1 of the PDF, saved as the cover image.
alter table public.books add column if not exists cover_path text;
alter table public.books add column if not exists audio_tracks jsonb not null default '[]'::jsonb;

create table if not exists public.book_chapters (
  id        uuid primary key default gen_random_uuid(),
  book_id   uuid not null references public.books(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position  int  not null,
  title     text not null,
  body      text not null,
  unique (book_id, position)
);

-- The مفردات list: key words Gemini picked for each chapter.
create table if not exists public.book_words (
  id              uuid primary key default gen_random_uuid(),
  book_id         uuid not null references public.books(id) on delete cascade,
  chapter_id      uuid not null references public.book_chapters(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position        int  not null default 0,
  word            text not null,
  lemma           text,
  part_of_speech  text,
  translation     text not null,
  definition      text,
  example         text,
  hidden          boolean not null default false
);

-- Words the learner saved for flashcard review (SM-2 spaced repetition).
create table if not exists public.saved_words (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lemma             text not null,
  word              text not null,
  translation       text not null,
  example           text,
  book_id           uuid references public.books(id) on delete set null,
  ease              real not null default 2.5,
  interval_days     int  not null default 0,
  reps              int  not null default 0,
  lapses            int  not null default 0,
  due_at            timestamptz not null default now(),
  last_reviewed_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, lemma)
);

create table if not exists public.reading_progress (
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id           uuid not null references public.books(id) on delete cascade,
  chapter_position  int  not null default 0,
  paragraph_index   int  not null default 0,
  completed_chapters int[] not null default '{}',
  last_tab          text,
  updated_at        timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- Added later (no-ops on fresh installs): see migrations/002.
alter table public.reading_progress
  add column if not exists paragraph_index    int    not null default 0,
  add column if not exists completed_chapters int[]  not null default '{}',
  add column if not exists last_tab           text;

-- Bookmarks: a saved paragraph with an optional note.
create table if not exists public.bookmarks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id           uuid not null references public.books(id) on delete cascade,
  chapter_position  int  not null,
  paragraph_index   int  not null default 0,
  excerpt           text,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists book_chapters_book_idx on public.book_chapters (book_id, position);
create index if not exists book_words_chapter_idx on public.book_words (chapter_id, position);
create index if not exists book_words_book_idx    on public.book_words (book_id);
create index if not exists saved_words_due_idx    on public.saved_words (user_id, due_at);
create index if not exists bookmarks_book_idx     on public.bookmarks (book_id, chapter_position, paragraph_index);

-- ─────────────────────────────────────────────
-- Row Level Security: every row belongs to one user
-- ─────────────────────────────────────────────

-- Signed-in users may use these tables (RLS below limits them to their own
-- rows). Logged-out visitors (anon) get no access at all.
grant select, insert, update, delete
  on public.books, public.book_chapters, public.book_words, public.saved_words, public.reading_progress, public.bookmarks
  to authenticated;

alter table public.books            enable row level security;
alter table public.book_chapters    enable row level security;
alter table public.book_words       enable row level security;
alter table public.saved_words      enable row level security;
alter table public.reading_progress enable row level security;
alter table public.bookmarks        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['books','book_chapters','book_words','saved_words','reading_progress','bookmarks'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- Storage: private bucket, files live under <user_id>/<book_id>/...
-- ─────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('book-media', 'book-media', false)
on conflict (id) do nothing;

drop policy if exists "book-media own files read"   on storage.objects;
drop policy if exists "book-media own files write"  on storage.objects;
drop policy if exists "book-media own files update" on storage.objects;
drop policy if exists "book-media own files delete" on storage.objects;

create policy "book-media own files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'book-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "book-media own files write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'book-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "book-media own files update" on storage.objects
  for update to authenticated
  using (bucket_id = 'book-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "book-media own files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'book-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
