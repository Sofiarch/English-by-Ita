import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Bookmark, Check, ExternalLink, GraduationCap, Pencil, Trash2, X } from "lucide-react";
import {
  addBookmark, deleteBook, deleteBookmark, ensureCover, getBook, getBookWords, getChapters, getProgress,
  listBookmarks, listSavedWords, regenerateWords, retryBook, saveProgress, saveWords, setWordHidden,
  bookTracks, mediaUrl, unsaveWord, updateBookmarkNote,
} from "../lib/data.js";
import AudioPlaylist from "../components/AudioPlaylist.jsx";
import { useSyncVersion } from "../lib/useSync.js";
import { useI18n } from "../lib/i18n.jsx";
import { BookCover, Button, En, ErrorNote, IconButton, LevelTag, Segmented, Spinner } from "../components/ui.jsx";
import VocabList from "../components/VocabList.jsx";
import Reader from "../components/Reader.jsx";
import ImportProgress from "../components/ImportProgress.jsx";
import EditBookDialog from "../components/EditBookDialog.jsx";

const TAB_IDS = ["words", "read", "listen", "pdf"];

function ChapterPicker({ chapters, value, onChange, allowAll, completed }) {
  const { t } = useI18n();
  const chip = (on) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm tabular-nums transition-colors ${on ? "bg-text text-bg" : "bg-surface-2 text-muted hover:text-text"}`;
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-1.5 pb-1" role="group" aria-label={t("book.chapterPicker")}>
        {allowAll && (
          <button type="button" aria-pressed={value === "all"} onClick={() => onChange("all")} className={chip(value === "all")}>
            {t("book.allChapters")}
          </button>
        )}
        {chapters.map((c) => (
          <button key={c.id} type="button" aria-pressed={value === c.position} title={c.title} onClick={() => onChange(c.position)} className={chip(value === c.position)}>
            {completed.has(c.position) && <Check className="size-3.5 text-teal" aria-label={t("progress.finished")} />}
            {t("book.chapter", { n: c.position + 1 })}
          </button>
        ))}
      </div>
    </div>
  );
}

function PdfView({ path }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { mediaUrl(path).then(setUrl).catch(setError); }, [path]);

  if (error) return <ErrorNote error={error} />;
  if (!url) return <Spinner />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("book.pdfHint")}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-line">
          <ExternalLink className="size-4" aria-hidden />
          {t("book.openPdf")}
        </a>
      </div>
      <iframe title="PDF" src={`${url}#view=FitH`} className="h-[calc(100dvh-14rem)] min-h-[32rem] w-full rounded-3xl border border-line bg-surface shadow-lift" />
    </div>
  );
}

function BookmarksPanel({ bookmarks, chapters, onGo, onDelete, onNote, onClose }) {
  const { t } = useI18n();
  return (
    <section className="rise rounded-3xl bg-surface p-4 shadow-lift sm:p-5" aria-label={t("bm.title")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{t("bm.title")}</h3>
        <IconButton label={t("common.close")} onClick={onClose}><X className="size-4" /></IconButton>
      </div>
      {bookmarks.length === 0 ? (
        <p className="text-sm text-muted">{t("bm.empty")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {bookmarks.map((b) => {
            const ch = chapters.find((c) => c.position === b.chapter_position);
            return (
              <li key={b.id} className="rounded-2xl bg-surface-2/70 p-3">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => onGo(b)} className="min-w-0 flex-1 text-start" title={t("bm.go")}>
                    <span className="text-xs font-medium text-pink">{t("book.chapter", { n: b.chapter_position + 1 })}{ch ? " — " : ""}{ch && <En>{ch.title}</En>}</span>
                    <span className="mt-1 line-clamp-2 block text-sm"><En className="font-read">{b.excerpt}</En></span>
                  </button>
                  <IconButton label={t("bm.delete")} onClick={() => onDelete(b)} className="size-8 hover:text-danger"><Trash2 className="size-4" /></IconButton>
                </div>
                <input
                  defaultValue={b.note || ""}
                  placeholder={t("bm.notePh")}
                  onBlur={(e) => e.target.value !== (b.note || "") && onNote(b, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="mt-2 w-full rounded-xl border border-transparent bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Book() {
  const { t, errorText, dir } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [words, setWords] = useState([]);
  const [savedSet, setSavedSet] = useState(new Set());
  const [bookmarks, setBookmarks] = useState([]);
  const [completed, setCompleted] = useState(new Set());
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [jumpTo, setJumpTo] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [stage, setStage] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const b = await getBook(id);
      if (!b) return navigate("/", { replace: true });
      const [ch, ws, saved, prog, marks] = await Promise.all([
        getChapters(id), getBookWords(id), listSavedWords(), getProgress(id), listBookmarks(id).catch(() => []),
      ]);
      setBook(b);
      setChapters(ch);
      setWords(ws);
      setSavedSet(new Set(saved.map((s) => s.lemma)));
      setBookmarks(marks);
      setCompleted(new Set(prog?.completed_chapters || []));

      // Automatic resume: reopen the last tab + chapter and scroll to the saved paragraph.
      if (!params.has("ch") && ch.length) {
        const pos = Math.min(prog?.chapter_position ?? 0, ch.length - 1);
        const lastTab = TAB_IDS.includes(prog?.last_tab) ? prog.last_tab : null;
        setParams((p) => {
          p.set("ch", String(pos));
          if (lastTab && !p.has("tab")) p.set("tab", lastTab);
          return p;
        }, { replace: true });
        if (prog?.paragraph_index > 0) setJumpTo({ chapterId: ch[pos]?.id, paragraph: prog.paragraph_index, nonce: Date.now() });
      }
    } catch (e) {
      setError(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Refresh quietly when a sync brings in changes from another device.
  const syncVersion = useSyncVersion();
  useEffect(() => {
    if (!syncVersion || !book) return;
    Promise.all([getBook(id), getBookWords(id), listBookmarks(id), listSavedWords()]).then(([b, ws, marks, saved]) => {
      if (!b) return navigate("/", { replace: true });
      setBook((prev) => ({ ...b, cover_url: b.cover_url || prev?.cover_url }));
      setWords(ws);
      setBookmarks(marks);
      setSavedSet(new Set(saved.map((s) => s.lemma)));
      if (!chapters.length) getChapters(id).then(setChapters);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncVersion]);

  // Books imported before real covers existed get one made from their PDF.
  useEffect(() => {
    if (book?.status !== "ready" || book.cover_url || !book.pdf_path) return;
    ensureCover(book).then((url) => url && setBook((b) => ({ ...b, cover_url: url, cover_path: "set" }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, book?.status]);

  const tracks = bookTracks(book);
  const available = TAB_IDS.filter((x) => (x !== "listen" || tracks.length) && (x !== "pdf" || book?.pdf_path));
  const tab = available.includes(params.get("tab")) ? params.get("tab") : "words";
  const chParam = params.get("ch");
  const ch = chParam === "all" ? "all" : Math.max(0, Math.min(Number(chParam) || 0, Math.max(chapters.length - 1, 0)));
  const readCh = ch === "all" ? 0 : ch;
  const chapter = chapters.find((c) => c.position === readCh);

  const go = (next) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(next)) p.set(k, String(v));
      return p;
    });

  const pickChapter = (pos) => {
    go({ ch: pos });
    if (pos !== "all") saveProgress(id, { chapter_position: pos, paragraph_index: 0 });
  };

  const pickTab = (v) => {
    go({ tab: v, ...(v !== "words" && ch === "all" ? { ch: 0 } : {}) });
    saveProgress(id, { last_tab: v });
  };

  // ─── automatic progress while reading ───
  const posRef = useRef({ readCh, completed });
  posRef.current = { readCh, completed };
  const saveTimer = useRef(null);
  const lastSaved = useRef(null);

  const onPosition = useCallback((paragraph, atEnd) => {
    const { readCh: chNow, completed: done } = posRef.current;
    const key = `${chNow}:${paragraph}`;
    if (key !== lastSaved.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        lastSaved.current = key;
        saveProgress(id, { chapter_position: chNow, paragraph_index: paragraph });
      }, 1200);
    }
    if (atEnd && !done.has(chNow)) {
      const next = new Set(done).add(chNow);
      setCompleted(next);
      saveProgress(id, { completed_chapters: [...next].sort((a, b) => a - b) });
    }
  }, [id]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const groups = useMemo(() => {
    const byChapter = (c) => words.filter((w) => w.chapter_id === c.id);
    if (ch === "all") return chapters.map((c) => ({ key: c.id, title: c.title, words: byChapter(c) }));
    return chapter ? [{ key: chapter.id, title: null, words: byChapter(chapter) }] : [];
  }, [ch, chapter, chapters, words]);

  // ─── actions ───
  const keyOf = (w) => (w.lemma || w.word).toLowerCase();

  async function toggleSave(w) {
    setActionError(null);
    const k = keyOf(w);
    const wasSaved = savedSet.has(k);
    setSavedSet((s) => { const n = new Set(s); wasSaved ? n.delete(k) : n.add(k); return n; });
    try {
      if (wasSaved) await unsaveWord(k);
      else await saveWords([{ ...w, book_id: id }]);
    } catch (e) {
      setActionError(e);
      setSavedSet((s) => { const n = new Set(s); wasSaved ? n.add(k) : n.delete(k); return n; });
    }
  }

  async function saveMany(list) {
    setActionError(null);
    const keys = list.map(keyOf);
    setSavedSet((s) => new Set([...s, ...keys]));
    try {
      await saveWords(list.map((w) => ({ ...w, book_id: id })));
    } catch (e) {
      setActionError(e);
      setSavedSet((s) => { const n = new Set(s); keys.forEach((k) => n.delete(k)); return n; });
    }
  }

  async function setHidden(w, hidden) {
    setWords((ws) => ws.map((x) => (x.id === w.id ? { ...x, hidden } : x)));
    try { await setWordHidden(w.id, hidden); }
    catch (e) {
      setActionError(e);
      setWords((ws) => ws.map((x) => (x.id === w.id ? { ...x, hidden: !hidden } : x)));
    }
  }

  async function toggleBookmark(paragraph, text) {
    setActionError(null);
    const existing = bookmarks.find((b) => b.chapter_position === readCh && b.paragraph_index === paragraph);
    try {
      if (existing) {
        setBookmarks((bs) => bs.filter((b) => b.id !== existing.id));
        await deleteBookmark(existing.id);
      } else {
        const row = await addBookmark({ book_id: id, chapter_position: readCh, paragraph_index: paragraph, excerpt: text.slice(0, 180) });
        setBookmarks((bs) => [...bs, row].sort((a, b) => a.chapter_position - b.chapter_position || a.paragraph_index - b.paragraph_index));
      }
    } catch (e) {
      setActionError(e);
      setBookmarks(await listBookmarks(id).catch(() => bookmarks));
    }
  }

  function goToBookmark(b) {
    setShowBookmarks(false);
    go({ tab: tab === "listen" ? "listen" : "read", ch: b.chapter_position });
    setJumpTo({ chapterId: chapters.find((c) => c.position === b.chapter_position)?.id, paragraph: b.paragraph_index, nonce: Date.now(), smooth: true });
  }

  async function regenerate() {
    setActionError(null);
    setRegenerating(true);
    try {
      await regenerateWords(book);
      setWords(await getBookWords(id));
    } catch (e) {
      setActionError(e);
    } finally {
      setRegenerating(false);
    }
  }

  async function retry() {
    setActionError(null);
    try {
      await retryBook(book, setStage);
      setStage(null);
      await load();
    } catch (e) {
      setStage(null);
      setActionError(e);
      setBook((b) => ({ ...b, status: "failed", error: e.code ? `code:${e.code}` : e.message }));
    }
  }

  async function remove() {
    try {
      await deleteBook(book);
      navigate("/", { replace: true });
    } catch (e) {
      setActionError(e);
    }
  }

  // ─── render ───
  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (!book) return <Spinner full />;

  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const storedError = book.error?.startsWith("code:") ? { code: book.error.slice(5) } : book.error;
  const percent = book.chapter_count ? Math.round((completed.size / book.chapter_count) * 100) : 0;

  const header = (
    <header className="mb-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <BackIcon className="size-4" aria-hidden /> {t("book.back")}
      </Link>
      <div className="mt-4 flex flex-wrap items-end gap-5 sm:gap-7">
        <div className="aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-2xl shadow-lift sm:w-32">
          <BookCover book={book} className="size-full" />
        </div>
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="display text-2xl leading-tight font-bold sm:text-4xl"><En>{book.title}</En></h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-muted">
            {book.author && <En className="italic">{book.author}</En>}
            <LevelTag level={book.level} />
            {book.status === "ready" && (
              <>
                <span>{t("library.chapters", { n: book.chapter_count })}</span>
                <span>{t("library.words", { n: book.word_count })}</span>
              </>
            )}
          </div>
          {book.status === "ready" && (
            <div className="mt-3 flex max-w-xs items-center gap-3 text-xs text-muted">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-teal transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
              {t("progress.read", { n: percent })}
            </div>
          )}
        </div>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t("book.deleteQ")}</span>
            <Button variant="danger" onClick={remove}>{t("book.deleteYes")}</Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button variant="soft" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> {t("book.edit")}
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> {t("common.delete")}
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <EditBookDialog
          book={book}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { setBook((b) => ({ ...b, ...updated })); setEditing(false); }}
        />
      )}
    </header>
  );

  if (stage) {
    return (
      <>
        {header}
        <section className="max-w-xl rounded-3xl bg-surface p-7 shadow-lift"><ImportProgress stage={stage} /></section>
      </>
    );
  }

  if (book.status !== "ready") {
    return (
      <>
        {header}
        <section className="max-w-xl space-y-4 rounded-3xl bg-surface p-7 shadow-lift">
          <h2 className="text-lg font-semibold">{book.status === "failed" ? t("book.failedTitle") : t("book.incompleteTitle")}</h2>
          {book.status === "failed" && storedError
            ? <p className="text-sm text-danger">{errorText(storedError)}</p>
            : <p className="text-sm text-muted">{t("book.incompleteBody")}</p>}
          <ErrorNote error={actionError} />
          <div className="flex flex-wrap gap-3">
            <Button onClick={retry} disabled={!book.pdf_path}>{t("book.retry")}</Button>
            {book.pdf_path && <Button variant="soft" onClick={() => go({ tab: "pdf" })}>{t("book.tab.pdf")}</Button>}
          </div>
        </section>
        {tab === "pdf" && book.pdf_path && <div className="mt-6"><PdfView path={book.pdf_path} /></div>}
      </>
    );
  }

  const showChapters = tab !== "pdf";

  return (
    <>
      {header}

      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label={t("book.sections")} value={tab} onChange={pickTab} options={available.map((x) => ({ value: x, label: t(`book.tab.${x}`) }))} />
          <Link
            to={`/quiz?book=${book.id}`}
            className="ms-auto inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            <GraduationCap className="size-4" aria-hidden />
            {t("book.quizThis")}
          </Link>
          <button
            type="button"
            onClick={() => setShowBookmarks((v) => !v)}
            aria-expanded={showBookmarks}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
              showBookmarks ? "bg-pink text-white" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            <Bookmark className={`size-4 ${bookmarks.length ? "fill-current" : ""}`} aria-hidden />
            {t("bm.count", { n: bookmarks.length })}
          </button>
        </div>
        {showBookmarks && (
          <BookmarksPanel
            bookmarks={bookmarks}
            chapters={chapters}
            onGo={goToBookmark}
            onDelete={(b) => { setBookmarks((bs) => bs.filter((x) => x.id !== b.id)); deleteBookmark(b.id).catch(setActionError); }}
            onNote={(b, note) => { setBookmarks((bs) => bs.map((x) => (x.id === b.id ? { ...x, note } : x))); updateBookmarkNote(b.id, note).catch(setActionError); }}
            onClose={() => setShowBookmarks(false)}
          />
        )}
        {showChapters && (
          <ChapterPicker chapters={chapters} value={tab === "words" ? ch : readCh} onChange={pickChapter} allowAll={tab === "words"} completed={completed} />
        )}
        {showChapters && chapter && (tab !== "words" || ch !== "all") && (
          // English title: always laid out left-to-right so it doesn't jump when the UI language changes.
          <h2 dir="ltr" lang="en" className="display flex flex-wrap items-center gap-3 text-left text-xl font-bold text-primary sm:text-2xl">
            <span>{chapter.title}</span>
            {completed.has(readCh) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal/15 px-2.5 py-0.5 text-xs font-medium text-teal">
                <Check className="size-3.5" aria-hidden /> {t("progress.finished")}
              </span>
            )}
          </h2>
        )}
      </div>

      {actionError && <div className="mb-4"><ErrorNote error={actionError} /></div>}

      {tab === "words" && (
        <VocabList
          groups={groups}
          savedSet={savedSet}
          onToggleSave={toggleSave}
          onHide={(w) => setHidden(w, true)}
          onRestore={(w) => setHidden(w, false)}
          onSaveAll={saveMany}
          onRegenerate={regenerate}
          regenerating={regenerating}
        />
      )}

      {tab === "pdf" && <PdfView path={book.pdf_path} />}

      {tab === "listen" && tracks.length > 0 && <AudioPlaylist key={tracks.map((x) => x.path).join("|")} bookId={book.id} tracks={tracks} />}

      {(tab === "read" || tab === "listen") && chapter && (
        <div className={tab === "listen" ? "mt-8" : ""}>
          <Reader
            chapter={chapter}
            words={words.filter((w) => w.chapter_id === chapter.id)}
            savedSet={savedSet}
            onSave={(w) => { if (!savedSet.has(keyOf(w))) toggleSave(w); }}
            bookmarks={bookmarks.filter((b) => b.chapter_position === readCh)}
            onToggleBookmark={toggleBookmark}
            onPosition={onPosition}
            jumpTo={jumpTo}
          />
          <div className="mx-auto mt-12 flex max-w-[66ch] flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
            <Button variant="ghost" disabled={readCh <= 0} onClick={() => { pickChapter(readCh - 1); window.scrollTo({ top: 0 }); }}>
              {t("book.prev")}
            </Button>
            <Button variant="soft" onClick={() => pickTab("words")}>{t("book.chapterWords")}</Button>
            <Button variant="ghost" disabled={readCh >= chapters.length - 1} onClick={() => { pickChapter(readCh + 1); window.scrollTo({ top: 0 }); }}>
              {t("book.next")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
