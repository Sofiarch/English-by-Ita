import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Search, Trash2, Volume2 } from "lucide-react";
import { listSavedWords, unsaveWord } from "../lib/data.js";
import { describeDue, isDue } from "../lib/srs.js";
import { canSpeak, speak } from "../lib/speak.js";
import { useI18n } from "../lib/i18n.jsx";
import { useSyncVersion } from "../lib/useSync.js";
import { Ar, Cover, En, ErrorNote, IconButton, MarkedSentence, Spinner } from "../components/ui.jsx";

export default function MyWords() {
  const { t, lang } = useI18n();
  const [words, setWords] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  const load = () => {
    setError(null);
    listSavedWords().then(setWords).catch(setError);
  };
  const version = useSyncVersion();
  useEffect(load, [version]);

  const shown = useMemo(() => {
    if (!words) return [];
    const n = q.trim().toLowerCase();
    if (!n) return words;
    return words.filter((w) => w.word.toLowerCase().includes(n) || w.lemma.includes(n) || w.translation.includes(q.trim()));
  }, [words, q]);

  const due = words?.filter((w) => isDue(w)).length ?? 0;

  async function remove(w) {
    setWords((ws) => ws.filter((x) => x.id !== w.id));
    try { await unsaveWord(w.lemma); }
    catch (e) { setError(e); load(); }
  }

  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (!words) return <Spinner full />;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-bold sm:text-4xl">{t("words.title")}</h1>
          <p className="mt-1 text-muted">{t("words.count", { n: words.length })}</p>
        </div>
        {due > 0 && (
          <Link to="/review" className="inline-flex items-center gap-2 rounded-full bg-yellow px-5 py-2.5 text-sm font-semibold text-[#151838] transition hover:brightness-95">
            {t("words.reviewN", { n: due })}
          </Link>
        )}
      </div>

      {words.length === 0 ? (
        <div className="mt-8 grid items-center gap-8 rounded-[2rem] bg-surface p-6 shadow-lift sm:grid-cols-[1fr_10rem] sm:p-8">
          <p className="text-lg text-muted">{t("words.empty")}</p>
          <div className="hidden aspect-square overflow-hidden rounded-3xl sm:block" aria-hidden>
            <Cover seed="my-words-empty" className="size-full" />
          </div>
        </div>
      ) : (
        <>
          <label className="relative mt-8 block max-w-md">
            <span className="sr-only">{t("words.search")}</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("words.search")}
              className="w-full rounded-full border border-line bg-surface py-2.5 ps-11 pe-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </label>

          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {shown.map((w) => {
              const dueNow = isDue(w);
              return (
                <li key={w.id} className="flex gap-3 rounded-3xl bg-surface p-4 shadow-lift sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <En className="font-read text-xl font-semibold">{w.word}</En>
                      <Ar className="text-lg">{w.translation}</Ar>
                    </div>
                    {w.example && (
                      <p className="mt-1.5 text-sm leading-6 text-muted">
                        <MarkedSentence sentence={w.example} word={w.word} />
                      </p>
                    )}
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${dueNow ? "bg-yellow/25 font-medium text-text" : "bg-surface-2"}`}>
                        <span className={`size-1.5 rounded-full ${dueNow ? "bg-yellow" : "bg-line-strong"}`} />
                        {t("words.next", { when: describeDue(w.due_at, lang, t("due.now")) })}
                      </span>
                      {w.books?.title && (
                        <Link to={`/book/${w.book_id}`} className="hover:text-text hover:underline"><En>{w.books.title}</En></Link>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {canSpeak && (
                      <IconButton label={t("common.listenTo", { w: w.word })} onClick={(e) => speak(w.word, 1, e.currentTarget)}>
                        <Volume2 className="size-[18px]" />
                      </IconButton>
                    )}
                    <IconButton label={t("words.remove")} onClick={() => remove(w)} className="hover:text-danger">
                      <Trash2 className="size-[18px]" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className="mt-6 text-muted">{t("words.noMatch")}</p>}
        </>
      )}
    </div>
  );
}
