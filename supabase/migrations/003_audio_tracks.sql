-- Migration 003: several audio clips per book, played one after another.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
--
-- audio_tracks is an ordered list: [{ "path": "...", "name": "01 Chapter one.mp3" }, …]
-- audio_path is kept (= first clip) for older app versions.

alter table public.books add column if not exists audio_tracks jsonb not null default '[]'::jsonb;
