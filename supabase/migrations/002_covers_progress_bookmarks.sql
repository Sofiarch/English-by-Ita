-- Migration 002: real covers, automatic reading progress, bookmarks.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.

-- 1. Real cover: page 1 of the PDF, saved as an image.
alter table public.books add column if not exists cover_path text;

-- 2. Automatic progress: exact spot + finished chapters + last tab.
alter table public.reading_progress
  add column if not exists paragraph_index    int    not null default 0,
  add column if not exists completed_chapters int[]  not null default '{}',
  add column if not exists last_tab           text;

-- 3. Bookmarks: a saved paragraph with an optional note.
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
create index if not exists bookmarks_book_idx on public.bookmarks (book_id, chapter_position, paragraph_index);

alter table public.bookmarks enable row level security;
drop policy if exists "own rows" on public.bookmarks;
create policy "own rows" on public.bookmarks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.bookmarks to authenticated;
