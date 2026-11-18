import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileImage, FileText, Music, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { bookTracks, editBook, naturalSort } from "../lib/data.js";
import { LEVELS } from "../lib/levels.js";
import { useI18n } from "../lib/i18n.jsx";
import { useSyncStatus } from "../lib/useSync.js";
import { BookCover, Button, En, ErrorNote, IconButton } from "./ui.jsx";

const isAudio = (f) => f.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(f.name);
let nextKey = 0;

/**
 * Edit a book: title, author, level, audio recording, cover.
 * Nothing changes until "Save changes"; files upload when online.
 */
export default function EditBookDialog({ book, onClose, onSaved }) {
  const { t } = useI18n();
  const { online } = useSyncStatus();
  const [title, setTitle] = useState(book.title || "");
  const [author, setAuthor] = useState(book.author || "");
  const [level, setLevel] = useState(book.level);
  const original = bookTracks(book);
  // Clip list being edited: { key, path, name } for existing clips, { key, file, name } for new ones.
  const [tracks, setTracks] = useState(() => original.map((tr) => ({ key: nextKey++, path: tr.path, name: tr.name })));
  const [cover, setCover] = useState(undefined);   // File | "pdf" | undefined
  const [coverPreview, setCoverPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const audioInput = useRef(null);
  const coverInput = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector("input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!(cover instanceof File)) return setCoverPreview(null);
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const addAudio = (fileList) => {
    setError(null);
    const files = [...(fileList || [])];
    if (!files.length) return;
    if (files.some((f) => !isAudio(f))) setError(t("edit.notAudio"));
    const good = naturalSort(files.filter(isAudio)).map((file) => ({ key: nextKey++, file, name: file.name }));
    setTracks((list) => [...list, ...good]);
  };
  const move = (i, d) => setTracks((list) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const removeTrack = (key) => setTracks((list) => list.filter((x) => x.key !== key));
  const tracksChanged =
    tracks.length !== original.length || tracks.some((x, i) => x.file || x.path !== original[i]?.path);

  const pickCover = (f) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError(t("edit.notImage"));
    setCover(f);
  };

  const patch = {};
  if (title.trim() && title.trim() !== book.title) patch.title = title.trim();
  if ((author.trim() || null) !== (book.author || null)) patch.author = author.trim() || null;
  if (level !== book.level) patch.level = level;
  const dirty = Object.keys(patch).length > 0 || tracksChanged || cover !== undefined;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await editBook(book, { patch, tracks: tracksChanged ? tracks : undefined, cover });
      onSaved(updated);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  const input = "w-full rounded-2xl border border-line bg-bg px-4 py-2.5 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("edit.title")}
        className="rise max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-surface p-6 shadow-lift sm:rounded-[2rem] sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="display text-2xl font-bold">{t("edit.title")}</h2>
          <IconButton label={t("common.close")} onClick={onClose} disabled={busy}><X className="size-5" /></IconButton>
        </div>

        <div className="space-y-7">
          {/* Title + author */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("add.titleLabel")}</span>
              <input className={input} dir="ltr" lang="en" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("add.authorLabel")}</span>
              <input className={input} dir="ltr" lang="en" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
          </div>

          {/* Level */}
          <fieldset>
            <legend className="text-sm font-medium">{t("add.level")}</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={level === l.id}
                  onClick={() => setLevel(l.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm transition-colors ${
                    level === l.id ? "bg-surface" : "border-transparent bg-surface-2 text-muted hover:text-text"
                  }`}
                  style={level === l.id ? { borderColor: l.color } : undefined}
                >
                  <span className="size-2 rounded-full" style={{ background: l.color }} />
                  <En>{l.label}</En>
                </button>
              ))}
            </div>
            {level !== book.level && <p className="mt-2 text-sm text-muted">{t("edit.levelNote")}</p>}
          </fieldset>

          {/* Audio clips */}
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{t("edit.audioTracks")}</h3>
              <p className="text-xs text-muted">{t("edit.audioHint")}</p>
            </div>
            <div className="rounded-3xl bg-surface-2/70 p-2">
              {tracks.length === 0 ? (
                <p className="flex items-center gap-3 px-3 py-3 text-sm text-muted">
                  <Music className="size-4" aria-hidden /> {t("edit.audioNone")}
                </p>
              ) : (
                <ol className="space-y-1">
                  {tracks.map((tr, i) => (
                    <li key={tr.key} className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2">
                      <span className="w-5 shrink-0 text-center text-xs text-muted tabular-nums" dir="ltr">{i + 1}</span>
                      <bdi dir="ltr" className="min-w-0 flex-1 truncate text-start text-sm">{tr.name}</bdi>
                      {tr.file && (
                        <span className="shrink-0 rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-medium text-teal">
                          {t("edit.newClip")} · {(tr.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      )}
                      <IconButton label={t("edit.moveUp")} onClick={() => move(i, -1)} disabled={i === 0} className="size-8"><ArrowUp className="size-4" /></IconButton>
                      <IconButton label={t("edit.moveDown")} onClick={() => move(i, 1)} disabled={i === tracks.length - 1} className="size-8"><ArrowDown className="size-4" /></IconButton>
                      <IconButton label={t("edit.removeClip")} onClick={() => removeTrack(tr.key)} className="size-8 hover:text-danger"><Trash2 className="size-4" /></IconButton>
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                onClick={() => audioInput.current?.click()}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-3 py-3 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-text"
              >
                <Plus className="size-4" aria-hidden /> {t("edit.audioAddMany")}
              </button>
              <input ref={audioInput} type="file" accept="audio/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => { addAudio(e.target.files); e.target.value = ""; }} />
            </div>
          </section>

          {/* Cover */}
          <section>
            <h3 className="mb-2 text-sm font-medium">{t("edit.cover")}</h3>
            <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-surface-2/70 p-4">
              <div className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl shadow-lift">
                {coverPreview ? <img src={coverPreview} alt="" className="size-full object-cover" /> : <BookCover book={book} className="size-full" />}
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                <Button variant="soft" onClick={() => coverInput.current?.click()}><FileImage className="size-4" aria-hidden />{t("edit.coverUpload")}</Button>
                {book.pdf_path && (
                  <Button variant={cover === "pdf" ? "primary" : "soft"} onClick={() => setCover(cover === "pdf" ? undefined : "pdf")}>
                    <FileText className="size-4" aria-hidden />{t("edit.coverFromPdf")}
                  </Button>
                )}
                {cover !== undefined && (
                  <Button variant="quiet" onClick={() => setCover(undefined)}><RotateCcw className="size-4" aria-hidden />{t("common.cancel")}</Button>
                )}
              </div>
              <input ref={coverInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </section>

          {!online && (tracks.some((x) => x.file) || cover) && <p className="rounded-2xl bg-yellow/20 px-4 py-3 text-sm">{t("edit.offlineNote")}</p>}
          <ErrorNote error={error} />

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
            <Button variant="quiet" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={!dirty || busy || !title.trim()}>{busy ? t("edit.saving") : t("edit.save")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
