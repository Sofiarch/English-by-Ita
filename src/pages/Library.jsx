import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Plus, Search } from "lucide-react";
import { countDue, listBooks, listProgress } from "../lib/data.js";
import { useSyncVersion } from "../lib/useSync.js";
import { LEVELS } from "../lib/levels.js";
import { useI18n } from "../lib/i18n.jsx";
import { BookCover, Cover, En, ErrorNote, LevelTag, Spinner } from "../components/ui.jsx";

function BookCard({ book, progress }) {
  const { t } = useI18n();
  return (
    <Link to={`/book/${book.id}`} className="group block focus-visible:outline-offset-4">
      <div className="relative aspect-[3/4] overflow-hidden rounded-3xl shadow-lift transition-transform duration-300 group-hover:-translate-y-1">
        <BookCover book={book} className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.04]" />
        {book.status === "ready" && progress && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-3 text-white">
            <p className="text-xs font-medium">{t("progress.continue", { n: (progress.chapter_position ?? 0) + 1 })}</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-yellow"
                style={{ width: `${book.chapter_count ? Math.round(((progress.completed_chapters?.length || 0) / book.chapter_count) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
        {book.status !== "ready" && (
          <span
            className={`absolute start-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur ${
              book.status === "failed" ? "bg-danger text-white" : "bg-surface/90 text-text"
            }`}
          >
            {book.status === "failed" ? t("library.failed") : t("library.processing")}
          </span>
        )}
      </div>
      <div className="mt-3 px-1">
        <h3 className="text-base leading-snug font-semibold text-text">
          <En>{book.title}</En>
        </h3>
        {book.author && <p className="mt-0.5 text-sm text-muted"><En>{book.author}</En></p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <LevelTag level={book.level} />
          {book.status === "ready" && (
            <>
              <span>{t("library.chapters", { n: book.chapter_count })}</span>
              <span>{t("library.words", { n: book.word_count })}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function DueBanner() {
  const { t } = useI18n();
  const [due, setDue] = useState(0);
  const version = useSyncVersion();
  useEffect(() => { countDue().then(setDue).catch(() => {}); }, [version]);
  if (!due) return null;
  return (
    <Link
      to="/review"
      className="mt-6 flex items-center gap-4 rounded-3xl bg-yellow px-5 py-4 text-[#151838] transition-transform hover:-translate-y-0.5"
    >
      <span className="display text-3xl font-bold">{due}</span>
      <span className="flex-1 font-medium">{t("library.due", { n: due })}</span>
      <span className="rounded-full bg-[#151838] px-4 py-2 text-sm font-medium text-white">{t("library.dueBtn")}</span>
    </Link>
  );
}

export default function Library() {
  const { t } = useI18n();
  const [books, setBooks] = useState(null);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");

  const load = () => {
    setError(null);
    listBooks().then(setBooks).catch(setError);
    listProgress().then(setProgress);
  };
  const version = useSyncVersion();
  useEffect(load, [version]);

  const shown = useMemo(() => {
    if (!books) return [];
    const needle = q.trim().toLowerCase();
    return books.filter(
      (b) => (level === "all" || b.level === level) &&
        (!needle || b.title.toLowerCase().includes(needle) || (b.author || "").toLowerCase().includes(needle)),
    );
  }, [books, level, q]);

  const levelsInUse = useMemo(() => LEVELS.filter((l) => books?.some((b) => b.level === l.id)), [books]);

  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (!books) return <Spinner full />;

  const addButton = (
    <Link to="/add" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition hover:brightness-110">
      <Plus className="size-4" aria-hidden />
      {t("library.add")}
    </Link>
  );

  if (books.length === 0) {
    return (
      <section className="grid items-center gap-10 py-6 md:grid-cols-[1fr_0.8fr]">
        <div>
          <h1 className="display text-3xl leading-tight font-bold sm:text-4xl">{t("library.emptyTitle")}</h1>
          <p className="mt-4 max-w-lg text-lg text-muted">{t("library.emptyBody")}</p>
          <div className="mt-8">{addButton}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 opacity-90" aria-hidden>
          {["a", "b", "c"].map((s, i) => (
            <div key={s} className={`aspect-[3/4] overflow-hidden rounded-2xl shadow-lift ${i === 1 ? "translate-y-6" : ""}`}>
              <Cover seed={`empty-shelf-${s}`} className="size-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-bold sm:text-4xl">{t("library.title")}</h1>
          <p className="mt-1 text-muted">{t("library.bookCount", { n: books.length })}</p>
        </div>
        {addButton}
      </div>

      <DueBanner />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">{t("library.search")}</span>
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("library.search")}
            className="w-full rounded-full border border-line bg-surface py-2.5 ps-11 pe-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </label>
        {levelsInUse.length > 1 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label={t("add.level")}>
            {[{ id: "all", label: t("library.all") }, ...levelsInUse].map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={level === l.id}
                onClick={() => setLevel(l.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  level === l.id ? "bg-text text-bg" : "bg-surface-2 text-muted hover:text-text"
                }`}
              >
                {l.id === "all" ? l.label : <En>{l.label}</En>}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-12 text-muted">{t("library.noMatch")}</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((b) => <BookCard key={b.id} book={b} progress={progress[b.id]} />)}
        </div>
      )}
    </div>
  );
}
