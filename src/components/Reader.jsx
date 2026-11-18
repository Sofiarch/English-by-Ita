import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, BookmarkPlus, Volume2, X } from "lucide-react";
import { translateWord } from "../lib/api.js";
import { canSpeak, speak } from "../lib/speak.js";
import { posInfo, useI18n } from "../lib/i18n.jsx";
import { Ar, Button, En, IconButton, Spinner } from "./ui.jsx";
import ReaderSettings from "./ReaderSettings.jsx";
import { useReaderSettings } from "../lib/readerSettings.js";

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

function tokenize(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], at: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

function sentenceAt(text, at) {
  let s = at;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  let e = at;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  return text.slice(s, e + 1).trim();
}

/** Simple inflection guesses so "castles", "walked", "running" find their list entry. */
function candidates(token) {
  const w = token.toLowerCase().replace(/’/g, "'");
  const c = [w];
  if (w.endsWith("'s")) c.push(w.slice(0, -2));
  if (w.endsWith("ies")) c.push(w.slice(0, -3) + "y");
  if (w.endsWith("es")) c.push(w.slice(0, -2));
  if (w.endsWith("s")) c.push(w.slice(0, -1));
  if (w.endsWith("ied")) c.push(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) c.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith("ing")) c.push(w.slice(0, -3), w.slice(0, -3) + "e");
  if (/(.)\1(ed|ing)$/.test(w)) c.push(w.replace(/(.)\1(ed|ing)$/, "$1"));
  return c;
}

const findEntry = (lookup, token) => candidates(token).map((c) => lookup.get(c)).find(Boolean) || null;

const Paragraph = memo(function Paragraph({ text, pIndex, vocabLookup, active, bookmarked, onBookmark, bookmarkLabel }) {
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <div className="group relative" data-para={pIndex}>
      {onBookmark && (
        <button
          type="button"
          onClick={() => onBookmark(pIndex)}
          aria-pressed={bookmarked}
          aria-label={bookmarkLabel}
          title={bookmarkLabel}
          className={`bm-btn absolute -start-10 top-1.5 flex size-8 items-center justify-center rounded-full transition-all ${
            bookmarked ? "is-on bg-pink text-white" : "text-muted hover:bg-surface-2 hover:text-pink"
          }`}
        >
          {bookmarked ? <Bookmark className="size-4 fill-current" /> : <BookmarkPlus className="size-4" />}
        </button>
      )}
    <p className={`mb-7 ${bookmarked ? "rounded-e-xl" : ""}`}>
      {tokens.map((tok, i) => {
        if (tok.at === undefined) return <span key={i}>{tok.t}</span>;
        const entry = findEntry(vocabLookup, tok.t);
        const isActive = active?.p === pIndex && active?.at === tok.at;
        return (
          <span
            key={i}
            data-p={pIndex}
            data-at={tok.at}
            className={`tok ${entry ? "in-list" : ""} ${isActive ? "is-active" : ""}`}
            style={entry ? { "--ink": posInfo(entry.part_of_speech).ink } : undefined}
          >
            {tok.t}
          </span>
        );
      })}
    </p>
    </div>
  );
});

function WordSheet({ sel, entry, savedSet, onSave, onClose }) {
  const { t, errorText } = useI18n();
  const [state, setState] = useState({ loading: !entry, data: null, error: null });

  useEffect(() => {
    if (entry) return;
    let alive = true;
    setState({ loading: true, data: null, error: null });
    translateWord(sel.word, sel.sentence)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e }));
    return () => { alive = false; };
  }, [sel.word, sel.sentence, entry]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const info = entry || state.data;
  const lemma = (info?.lemma || sel.word).toLowerCase();
  const saved = savedSet.has(lemma) || savedSet.has(sel.word.toLowerCase());
  const pos = info?.part_of_speech ? posInfo(info.part_of_speech) : null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 px-3 md:bottom-6" role="dialog" aria-label={sel.word}>
      <div className="rise mx-auto max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
        <div className="h-1.5" style={{ background: pos?.ink || "var(--primary)" }} aria-hidden />
        <div className="p-5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <En className="font-read text-3xl font-semibold">{sel.word}</En>
                {info?.lemma && info.lemma.toLowerCase() !== sel.word.toLowerCase() && <En className="text-sm text-muted">{info.lemma}</En>}
                {pos && <span className="text-xs text-muted">{t(`pos.${pos.key}`)}</span>}
              </div>
              <div className="mt-2 min-h-8 text-xl">
                {state.loading && !entry ? (
                  <Spinner label={t("reader.translating")} />
                ) : info ? (
                  <Ar className="font-medium">{info.translation}</Ar>
                ) : (
                  <span className="text-sm text-danger">{errorText(state.error)}</span>
                )}
              </div>
              {entry?.definition && <p className="mt-1 text-sm text-muted"><En>{entry.definition}</En></p>}
            </div>
            {canSpeak && (
              <IconButton label={t("common.listen")} onClick={(e) => speak(sel.word, 1, e.currentTarget)}>
                <Volume2 className="size-5" />
              </IconButton>
            )}
            <IconButton label={t("common.close")} onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </div>
          {info && (
            <div className="mt-4">
              {saved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/15 px-3 py-1.5 text-sm font-medium text-teal">
                  <BookmarkCheck className="size-4" aria-hidden /> {t("reader.savedIn")}
                </span>
              ) : (
                <Button onClick={() => onSave({ word: entry?.word || sel.word, lemma, translation: info.translation, example: entry?.example || sel.sentence })}>
                  <Bookmark className="size-4" aria-hidden />
                  {t("vocab.save")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The full chapter text. Words from the مفردات list are underlined in their
 * part-of-speech ink; tapping any word shows its meaning in context.
 */
export default function Reader({ chapter, words, savedSet, onSave, bookmarks, onToggleBookmark, onPosition, jumpTo }) {
  const { t } = useI18n();
  const [sel, setSel] = useState(null);
  const articleRef = useRef(null);
  const reader = useReaderSettings();
  const paragraphs = useMemo(() => chapter.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), [chapter.body]);

  const vocabLookup = useMemo(() => {
    const m = new Map();
    for (const w of words) {
      if (w.hidden) continue;
      m.set(w.word.toLowerCase(), w);
      if (w.lemma) m.set(w.lemma.toLowerCase(), w);
    }
    return m;
  }, [words]);

  useEffect(() => setSel(null), [chapter.id]);

  // Jump to a saved spot (resume or bookmark). `jumpTo.nonce` lets the same spot be re-requested.
  useEffect(() => {
    if (!jumpTo || jumpTo.chapterId !== chapter.id) return;
    const el = articleRef.current?.querySelector(`[data-para="${jumpTo.paragraph}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 140;
    window.scrollTo({ top: Math.max(0, top), behavior: jumpTo.smooth ? "smooth" : "instant" });
    el.classList.add("flash");
    const timer = setTimeout(() => el.classList.remove("flash"), 1600);
    return () => clearTimeout(timer);
  }, [jumpTo, chapter.id]);

  // Report the paragraph at the top of the screen (and whether the end was reached) as the reader scrolls.
  useEffect(() => {
    if (!onPosition) return;
    let frame = 0;
    // allowEnd: only count "finished" after a real scroll, or after 20s on a chapter that fits on screen.
    const measure = (allowEnd = true) => {
      frame = 0;
      const paras = articleRef.current?.querySelectorAll("[data-para]");
      if (!paras?.length) return;
      let index = 0;
      for (const el of paras) {
        if (el.getBoundingClientRect().bottom > 150) { index = Number(el.dataset.para); break; }
      }
      const last = paras[paras.length - 1].getBoundingClientRect();
      onPosition(index, allowEnd && last.bottom <= window.innerHeight + 4);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => measure(true)); };
    window.addEventListener("scroll", onScroll, { passive: true });
    const first = setTimeout(() => measure(false), 400);
    const dwell = setTimeout(() => measure(true), 20_000); // short chapters may never scroll
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); clearTimeout(first); clearTimeout(dwell); };
  }, [onPosition, chapter.id]);

  const marked = useMemo(() => new Set((bookmarks || []).map((b) => b.paragraph_index)), [bookmarks]);

  function onClick(e) {
    const el = e.target.closest("[data-at]");
    if (!el) return;
    const p = Number(el.dataset.p);
    const at = Number(el.dataset.at);
    const word = el.textContent;
    if (sel && sel.p === p && sel.at === at) return setSel(null);
    setSel({ p, at, word, sentence: sentenceAt(paragraphs[p], at), entry: findEntry(vocabLookup, word) });
  }

  return (
    <>
      {/* Toolbar + text share one column whose width follows the text size (~66 characters per line). */}
      <div className="mx-auto" style={{ maxWidth: `${reader.settings.size * 33}px` }}>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 rounded-2xl bg-surface-2/70 px-4 py-2.5 text-sm text-muted">{t("book.tapHint")}</p>
        <ReaderSettings settings={reader.settings} update={reader.update} reset={reader.reset} />
      </div>
      <article
        ref={articleRef}
        lang="en"
        dir="ltr"
        onClick={onClick}
        style={reader.style}
        className="ps-10 text-text transition-[font-size,line-height] duration-150 sm:ps-0"
      >
        {paragraphs.map((p, i) => (
          <Paragraph
            key={i}
            pIndex={i}
            text={p}
            vocabLookup={vocabLookup}
            active={sel?.p === i ? sel : null}
            bookmarked={marked.has(i)}
            onBookmark={onToggleBookmark ? (idx) => onToggleBookmark(idx, paragraphs[idx]) : undefined}
            bookmarkLabel={marked.has(i) ? t("bm.remove") : t("bm.add")}
          />
        ))}
      </article>
      </div>
      {sel && (
        <WordSheet key={`${sel.p}-${sel.at}`} sel={sel} entry={sel.entry} savedSet={savedSet} onSave={onSave} onClose={() => setSel(null)} />
      )}
    </>
  );
}
