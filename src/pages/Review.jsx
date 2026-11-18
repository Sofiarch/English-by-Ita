import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Volume2 } from "lucide-react";
import { gradeWord, listSavedWords } from "../lib/data.js";
import { GRADES, describeDue, isDue, schedule } from "../lib/srs.js";
import { canSpeak, speak } from "../lib/speak.js";
import { useI18n } from "../lib/i18n.jsx";
import { Ar, Button, Cover, En, ErrorNote, IconButton, MarkedSentence, Spinner } from "../components/ui.jsx";

const SESSION_SIZE = 20;

const GRADE_STYLE = {
  again: { ink: "var(--danger)" },
  hard: { ink: "var(--yellow)" },
  good: { ink: "var(--blue)" },
  easy: { ink: "var(--teal)" },
};

export default function Review() {
  const { t, lang } = useI18n();
  const [queue, setQueue] = useState(null);
  const [total, setTotal] = useState(0);
  const [nextDue, setNextDue] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    listSavedWords()
      .then((all) => {
        const due = all.filter((w) => isDue(w)).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)).slice(0, SESSION_SIZE);
        setQueue(due);
        setTotal(due.length);
        const upcoming = all.filter((w) => !isDue(w)).sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0];
        setNextDue(upcoming?.due_at || null);
      })
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  const card = queue?.[0];
  const when = (iso) => describeDue(iso, lang, t("due.now"));

  const grade = useCallback(
    async (quality) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const updated = await gradeWord(card, quality);
        setDone((d) => d + 1);
        setFlipped(false);
        // Forgotten cards come back at the end of this session.
        if (quality < 3) setTotal((n) => n + 1);
        else if (!nextDue) setNextDue(updated.due_at);
        setQueue((q) => (quality < 3 ? [...q.slice(1), updated] : q.slice(1)));
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    },
    [card, busy, nextDue],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (!card || e.target.closest?.("input,textarea")) return;
      if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); setFlipped(true); }
      else if (flipped && ["1", "2", "3", "4"].includes(e.key)) grade(GRADES[Number(e.key) - 1].quality);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, grade]);

  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (!queue) return <Spinner full />;

  if (!card) {
    return (
      <section className="mx-auto grid max-w-3xl items-center gap-10 py-6 sm:grid-cols-[0.8fr_1fr]">
        <div className="mx-auto aspect-square w-48 overflow-hidden rounded-[2rem] shadow-lift sm:w-full">
          <Cover seed={done > 0 ? "review-done" : "review-empty"} className="size-full" />
        </div>
        <div>
          <h1 className="display text-3xl leading-tight font-bold">{done > 0 ? t("review.doneN", { n: done }) : t("review.none")}</h1>
          <p className="mt-3 text-lg text-muted">{nextDue ? t("review.nextAt", { when: when(nextDue) }) : t("review.saveSome")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:brightness-110">{t("review.toLibrary")}</Link>
            <Link to="/words" className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-medium hover:bg-line">{t("nav.words")}</Link>
          </div>
        </div>
      </section>
    );
  }

  const progress = total ? Math.min(1, done / total) : 0;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex items-center gap-4">
        <h1 className="display text-2xl font-bold">{t("review.title")}</h1>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-blue to-pink transition-all duration-500 rtl:bg-gradient-to-l" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="text-sm text-muted tabular-nums">{t("review.left", { n: queue.length })}</span>
      </div>

      <div key={card.id + String(flipped)} className="rise overflow-hidden rounded-[2rem] bg-surface shadow-lift">
        <div className="relative h-24 overflow-hidden">
          <Cover seed={card.lemma} className="absolute inset-0 size-full" />
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-2">
            <En className="font-read flex-1 text-4xl font-semibold sm:text-5xl">{card.word}</En>
            {canSpeak && (
              <IconButton label={t("common.listen")} onClick={(e) => speak(card.word, 1, e.currentTarget)}>
                <Volume2 className="size-5" />
              </IconButton>
            )}
          </div>
          {card.example && (
            <p className="mt-5 text-lg leading-8 text-muted">
              <MarkedSentence sentence={card.example} word={card.word} ink="var(--pink)" className="text-text" />
            </p>
          )}

          {flipped ? (
            <div className="reveal mt-7 border-t border-line pt-6">
              <Ar className="text-3xl font-semibold">{card.translation}</Ar>
            </div>
          ) : (
            <Button className="mt-8 w-full py-3" onClick={() => setFlipped(true)}>
              {t("review.show")}
              <kbd className="hidden rounded-md bg-white/20 px-1.5 text-xs sm:inline" dir="ltr">Space</kbd>
            </Button>
          )}
        </div>
      </div>

      {flipped && (
        <div className="rise mt-4 grid grid-cols-4 gap-2">
          {GRADES.map((g, i) => (
            <button
              key={g.id}
              type="button"
              disabled={busy}
              onClick={() => grade(g.quality)}
              className="group flex flex-col items-center gap-0.5 rounded-2xl bg-surface px-2 py-3 text-sm shadow-lift transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              <span className="mb-1 h-1 w-6 rounded-full" style={{ background: GRADE_STYLE[g.id].ink }} aria-hidden />
              <span className="font-semibold">{t(`grade.${g.id}`)}</span>
              <span className="text-[11px] text-muted">{when(schedule(card, g.quality).due_at)}</span>
              <kbd className="mt-0.5 hidden text-[10px] text-muted sm:inline" dir="ltr">{i + 1}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
