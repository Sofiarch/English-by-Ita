import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Bookmark, BookmarkCheck, Check, Ear, Lightbulb, ListChecks, Shuffle, SpellCheck, Volume2, X } from "lucide-react";
import { listQuizPool, listSavedWords, saveWords } from "../lib/data.js";
import { QUIZ_TYPES, buildQuiz, checkTyped } from "../lib/quiz.js";
import { canSpeak, preloadSpeech, speak } from "../lib/speak.js";
import { posInfo, useI18n } from "../lib/i18n.jsx";
import { Ar, BookCover, Button, Cover, En, ErrorNote, Segmented, Spinner } from "../components/ui.jsx";

const TYPE_ICONS = { mcq_meaning: ListChecks, mcq_word: Shuffle, spell: SpellCheck, listen: Ear };
const PREFS_KEY = "ita-quiz-prefs";

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

// ─── Setup ──────────────────────────────────────────────

function Setup({ books, pool, initialBooks, onStart }) {
  const { t } = useI18n();
  const prefs = readPrefs();
  const [picked, setPicked] = useState(() => new Set(initialBooks)); // empty = all stories
  const [types, setTypes] = useState(() => {
    const saved = (prefs.types || QUIZ_TYPES).filter((x) => QUIZ_TYPES.includes(x));
    return new Set(saved.length ? saved : QUIZ_TYPES);
  });
  const [count, setCount] = useState(prefs.count || 10);

  const available = useMemo(() => (picked.size ? pool.filter((w) => picked.has(w.book_id)) : pool), [pool, picked]);
  const uniqueCount = useMemo(() => new Set(available.map((w) => (w.lemma || w.word).toLowerCase())).size, [available]);

  const toggleBook = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleType = (id) => setTypes((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function start() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ types: [...types], count })); } catch { /* per visit */ }
    onStart({ words: available, types: QUIZ_TYPES.filter((x) => types.has(x)), count: Math.min(count, uniqueCount) });
  }

  if (!books.length) {
    return (
      <div className="rounded-[2rem] bg-surface p-8 shadow-lift">
        <p className="text-lg text-muted">{t("quiz.needWords")}</p>
        <Link to="/add" className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary">{t("library.add")}</Link>
      </div>
    );
  }

  const chip = (on) => `inline-flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm transition-all ${
    on ? "border-primary bg-surface shadow-lift" : "border-transparent bg-surface-2 text-muted hover:text-text"
  }`;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium">{t("quiz.books")}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={picked.size === 0} onClick={() => setPicked(new Set())} className={chip(picked.size === 0)}>
            <span className="grid size-7 grid-cols-2 gap-0.5 overflow-hidden rounded-md" aria-hidden>
              {books.slice(0, 4).map((b) => <BookCover key={b.id} book={b} className="size-full" />)}
            </span>
            {t("quiz.allBooks")}
          </button>
          {books.map((b) => (
            <button key={b.id} type="button" aria-pressed={picked.has(b.id)} onClick={() => toggleBook(b.id)} className={chip(picked.has(b.id))}>
              <span className="h-8 w-6 overflow-hidden rounded" aria-hidden><BookCover book={b} className="size-full" /></span>
              <En className="max-w-[16ch] truncate">{b.title}</En>
              {picked.has(b.id) && <Check className="size-4 text-primary" aria-hidden />}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">{t("quiz.pool", { n: uniqueCount })}</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">{t("quiz.types")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {QUIZ_TYPES.filter((x) => x !== "listen" || canSpeak).map((x) => {
            const Icon = TYPE_ICONS[x];
            const on = types.has(x);
            return (
              <button key={x} type="button" aria-pressed={on} onClick={() => toggleType(x)} className={`${chip(on)} flex-col items-start rounded-3xl p-4`}>
                <Icon className={`size-5 ${on ? "text-primary" : ""}`} aria-hidden />
                <span className="font-medium">{t(`quiz.type.${x}`)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4">
        <div>
          <h2 className="mb-2 text-sm font-medium">{t("quiz.count")}</h2>
          <Segmented label={t("quiz.count")} value={count} onChange={setCount} options={[5, 10, 20].map((n) => ({ value: n, label: String(n) }))} />
        </div>
        <Button className="ms-auto px-7 py-3 text-base" onClick={start} disabled={uniqueCount < 4 || types.size === 0}>
          {t("quiz.start")}
        </Button>
      </section>
      {uniqueCount < 4 && <p className="text-sm text-danger">{t("quiz.tooFew")}</p>}
    </div>
  );
}

// ─── One question ───────────────────────────────────────

function Question({ q, index, total, onAnswer, onNext }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState(null);   // option index (MCQ)
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);   // "correct" | "close" | "wrong"
  const [hint, setHint] = useState(false);
  const inputRef = useRef(null);
  const w = q.word;
  const pos = posInfo(w.part_of_speech);
  const isTyped = q.type === "listen";

  useEffect(() => {
    if (q.type === "listen") setTimeout(() => speak(w.word, 0.85), 250);
    if (isTyped) setTimeout(() => inputRef.current?.focus(), 50);
  }, [q, isTyped, w.word]);

  function choose(i) {
    if (result) return;
    setPicked(i);
    const r = q.options[i].correct ? "correct" : "wrong";
    setResult(r);
    onAnswer(r);
  }

  function submitTyped(e) {
    e?.preventDefault();
    if (result) return onNext();
    const r = checkTyped(typed, w);
    setResult(r);
    onAnswer(r);
  }

  function skip() {
    setResult("wrong");
    onAnswer("wrong");
  }

  // Keyboard: 1–4 pick, Enter = next.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input")) return;
      if (q.options && !result && ["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      else if (result && e.key === "Enter") { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isLast = index === total - 1;

  return (
    <div className="rise overflow-hidden rounded-[2rem] bg-surface shadow-lift">
      <div className="h-1.5" style={{ background: pos.ink }} aria-hidden />
      <div className="p-6 sm:p-8">
        <p className="text-sm font-medium text-muted">{t(`quiz.prompt.${q.type}`)}</p>

        {/* Prompt */}
        <div className="mt-4 min-h-24">
          {q.type === "mcq_meaning" && (
            <>
              <div className="flex items-center gap-3">
                <En className="font-read text-4xl font-semibold sm:text-5xl">{w.word}</En>
                {canSpeak && <button type="button" onClick={(e) => speak(w.word, 1, e.currentTarget)} aria-label={t("common.listen")} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text"><Volume2 className="size-5" /></button>}
              </div>
              {w.example && <p className="mt-3 text-muted"><En className="font-read">{w.example}</En></p>}
            </>
          )}
          {(q.type === "mcq_word" || q.type === "spell") && (
            <div>
              <Ar className="text-4xl font-bold sm:text-5xl">{w.translation}</Ar>
              <p className="mt-2 text-sm text-muted">{t(`pos.${pos.key}`)}</p>
            </div>
          )}
          {q.type === "listen" && (
            <button
              type="button"
              onClick={(e) => speak(w.word, 0.85, e.currentTarget)}
              className="inline-flex items-center gap-3 rounded-full bg-primary px-6 py-4 text-lg font-medium text-on-primary transition hover:brightness-110"
            >
              <Volume2 className="size-6" aria-hidden /> {t("quiz.play")}
            </button>
          )}
        </div>

        {/* Answer area */}
        {q.options ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, i) => {
              const state = !result ? "idle" : o.correct ? "right" : i === picked ? "wrong" : "dim";
              return (
                <button
                  key={o.id + i}
                  type="button"
                  disabled={Boolean(result)}
                  onClick={() => choose(i)}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-start text-lg transition-all ${
                    state === "idle" ? "border-line hover:-translate-y-0.5 hover:border-primary" :
                    state === "right" ? "border-teal bg-teal/12" :
                    state === "wrong" ? "border-danger bg-danger/10" : "border-line opacity-50"
                  }`}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted" dir="ltr">
                    {state === "right" ? <Check className="size-4 text-teal" /> : state === "wrong" ? <X className="size-4 text-danger" /> : i + 1}
                  </span>
                  {q.type === "mcq_meaning" ? <Ar>{o.label}</Ar> : <En className="font-read">{o.label}</En>}
                </button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={submitTyped} className="mt-6">
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              readOnly={Boolean(result)}
              dir="ltr"
              lang="en"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("quiz.typePh")}
              aria-label={t("quiz.typePh")}
              className={`w-full rounded-2xl border-2 bg-bg px-5 py-4 font-read text-2xl outline-none transition ${
                result === "correct" ? "border-teal" : result === "close" ? "border-yellow" : result === "wrong" ? "border-danger" : "border-line focus:border-primary"
              }`}
            />
            {!result && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={!typed.trim()}>{t("quiz.check")}</Button>
                <Button variant="quiet" onClick={skip}>{t("quiz.skip")}</Button>
                <button type="button" onClick={() => setHint(true)} className="ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text">
                  <Lightbulb className="size-4" aria-hidden />
                  {hint ? <span dir="auto">{t("quiz.hintText", { first: w.word[0], n: w.word.length })}</span> : t("quiz.hint")}
                </button>
              </div>
            )}
          </form>
        )}

        {/* Feedback */}
        {result && (
          <div className="reveal mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5">
            <div className="min-w-0 flex-1">
              {result === "correct" ? (
                <p className="text-lg font-semibold text-teal">{t("quiz.correct")}</p>
              ) : (
                <p className={`font-medium ${result === "close" ? "text-text" : "text-danger"}`}>
                  {result === "close" ? t("quiz.close") : t("quiz.wrong")}{" "}
                  <En className="font-read text-xl font-semibold text-text">{w.word}</En>
                  {q.type !== "mcq_word" && q.type !== "spell" && <> — <Ar className="text-text">{w.translation}</Ar></>}
                </p>
              )}
              <p className="mt-1 text-xs text-muted"><En>{w.bookTitle}</En></p>
            </div>
            <Button onClick={onNext} autoFocus>{isLast ? t("quiz.finish") : t("quiz.next")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Results ────────────────────────────────────────────

function Results({ questions, answers, onRetry, onNew }) {
  const { t } = useI18n();
  const correct = answers.filter((a) => a === "correct").length;
  const missed = questions.filter((_, i) => answers[i] !== "correct").map((q) => q.word);
  const pct = Math.round((correct / questions.length) * 100);
  const [savedSet, setSavedSet] = useState(new Set());

  useEffect(() => {
    listSavedWords().then((rows) => setSavedSet(new Set(rows.map((r) => r.lemma)))).catch(() => {});
  }, []);

  const keyOf = (w) => (w.lemma || w.word).toLowerCase();
  const unsaved = missed.filter((w) => !savedSet.has(keyOf(w)));

  async function saveMissed() {
    await saveWords(unsaved.map((w) => ({ ...w, book_id: w.book_id })));
    setSavedSet((s) => new Set([...s, ...unsaved.map(keyOf)]));
  }

  const ring = 2 * Math.PI * 52;
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-8 rounded-[2rem] bg-surface p-6 shadow-lift sm:p-8">
        <div className="relative size-36 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="12" />
            <circle cx="60" cy="60" r="52" fill="none" stroke={pct >= 80 ? "var(--teal)" : pct >= 50 ? "var(--yellow)" : "var(--pink)"}
              strokeWidth="12" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - pct / 100)} className="transition-all duration-700" />
          </svg>
          <span className="display absolute inset-0 flex items-center justify-center text-3xl font-bold" dir="ltr">{pct}%</span>
        </div>
        <div>
          <h2 className="display text-3xl font-bold">{pct >= 80 ? t("quiz.great") : pct >= 50 ? t("quiz.good") : t("quiz.keep")}</h2>
          <p className="mt-1 text-lg text-muted">{t("quiz.score", { c: correct, n: questions.length })}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {missed.length > 0 && <Button onClick={() => onRetry(missed)}>{t("quiz.retry")}</Button>}
            <Button variant="soft" onClick={onNew}>{t("quiz.new")}</Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">{t("quiz.missed")}</h3>
          {unsaved.length > 0 ? (
            <Button variant="soft" className="ms-auto" onClick={saveMissed}><Bookmark className="size-4" aria-hidden />{t("quiz.saveMissed")}</Button>
          ) : missed.length > 0 && (
            <span className="ms-auto inline-flex items-center gap-1.5 text-sm text-teal"><BookmarkCheck className="size-4" aria-hidden />{t("quiz.savedMissed")}</span>
          )}
        </div>
        {missed.length === 0 ? (
          <p className="text-muted">{t("quiz.allRight")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {missed.map((w) => (
              <li key={w.id} className="flex items-baseline gap-3 rounded-2xl bg-surface px-4 py-3 shadow-lift">
                <span className="size-2 shrink-0 rounded-full" style={{ background: posInfo(w.part_of_speech).ink }} aria-hidden />
                <En className="font-read text-lg font-semibold">{w.word}</En>
                <Ar className="text-muted">{w.translation}</Ar>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function Quiz() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null); // { questions, answers, index, config }

  useEffect(() => { listQuizPool().then(setData).catch(setError); }, []);

  // Fetch the next "listen" question's audio ahead of time so it plays instantly.
  useEffect(() => {
    const next = run?.questions[run.index + 1];
    if (next?.type === "listen") preloadSpeech(next.word.word);
    const now = run?.questions[run.index];
    if (now?.type === "listen") preloadSpeech(now.word.word);
  }, [run?.index, run?.questions]);

  const start = (config, words) => {
    const questions = buildQuiz(config.words, { types: config.types, count: config.count, words });
    setRun({ questions, answers: [], index: 0, config });
    window.scrollTo({ top: 0 });
  };

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner full />;

  const initialBooks = params.get("book") ? [params.get("book")] : [];

  return (
    <div className="mx-auto max-w-3xl">
      {!run ? (
        <>
          <div className="mb-8 flex items-center gap-5">
            <div className="hidden aspect-square w-20 shrink-0 overflow-hidden rounded-3xl shadow-lift sm:block" aria-hidden>
              <Cover seed="quiz-page" className="size-full" />
            </div>
            <div>
              <h1 className="display text-3xl font-bold sm:text-4xl">{t("quiz.title")}</h1>
              <p className="mt-1 text-muted">{t("quiz.lead")}</p>
            </div>
          </div>
          <Setup books={data.books} pool={data.words} initialBooks={initialBooks} onStart={(c) => start(c)} />
        </>
      ) : run.index < run.questions.length ? (
        <>
          <div className="mb-5 flex items-center gap-4">
            <button type="button" onClick={() => setRun(null)} aria-label={t("common.close")} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text">
              <X className="size-5" />
            </button>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(run.answers.length / run.questions.length) * 100}%` }} />
            </div>
            <span className="text-sm text-muted tabular-nums">{t("quiz.of", { i: run.index + 1, n: run.questions.length })}</span>
          </div>
          <Question
            key={run.questions[run.index].id}
            q={run.questions[run.index]}
            index={run.index}
            total={run.questions.length}
            onAnswer={(r) => setRun((s) => ({ ...s, answers: [...s.answers.slice(0, s.index), r] }))}
            onNext={() => setRun((s) => ({ ...s, index: s.index + 1 }))}
          />
        </>
      ) : (
        <Results
          questions={run.questions}
          answers={run.answers}
          onRetry={(words) => start(run.config, words)}
          onNew={() => setRun(null)}
        />
      )}
    </div>
  );
}
