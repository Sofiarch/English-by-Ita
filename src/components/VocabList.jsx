import { useState } from "react";
import { Bookmark, BookmarkCheck, EyeOff, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { canSpeak, speak } from "../lib/speak.js";
import { posInfo, useI18n } from "../lib/i18n.jsx";
import { Ar, Button, En, IconButton, MarkedSentence } from "./ui.jsx";

function Meaning({ text, hidden }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  if (!hidden || revealed) {
    return <Ar className={`text-lg font-medium ${hidden ? "reveal" : ""}`}>{text}</Ar>;
  }
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="rounded-full bg-surface-2 px-3 py-0.5 text-sm text-muted transition-colors hover:bg-line hover:text-text"
    >
      {t("vocab.reveal")}
    </button>
  );
}

function WordRow({ w, saved, onToggleSave, onHide, hideMeanings }) {
  const { t } = useI18n();
  const pos = posInfo(w.part_of_speech);
  return (
    <li className="group relative flex gap-3 rounded-3xl bg-surface p-4 shadow-lift sm:p-5" style={{ "--ink": pos.ink }}>
      {/* ink tab marks the part of speech */}
      <span className="absolute inset-y-5 start-0 w-1 rounded-e-full" style={{ background: pos.ink }} aria-hidden />
      <div className="min-w-0 flex-1 ps-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <En className="font-read text-2xl leading-tight font-semibold">{w.word}</En>
          {w.lemma && w.lemma !== w.word.toLowerCase() && <En className="text-sm text-muted">{w.lemma}</En>}
          <span
            className="rounded-full px-2 text-xs leading-5 font-medium"
            style={{ background: `color-mix(in srgb, ${pos.ink} 16%, transparent)`, color: `color-mix(in srgb, ${pos.ink} 70%, var(--text))` }}
          >
            {t(`pos.${pos.key}`)}
          </span>
          <Meaning text={w.translation} hidden={hideMeanings} key={String(hideMeanings)} />
        </div>
        {w.definition && <p className="mt-1 text-sm text-muted"><En>{w.definition}</En></p>}
        {w.example && (
          <p className="mt-3 rounded-2xl bg-surface-2/70 px-3.5 py-2.5 text-[0.95rem] leading-7">
            <MarkedSentence sentence={w.example} word={w.word} ink={pos.ink} />
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        {canSpeak && (
          <IconButton label={t("common.listenTo", { w: w.word })} onClick={(e) => speak(w.word, 1, e.currentTarget)}>
            <Volume2 className="size-[18px]" />
          </IconButton>
        )}
        <IconButton
          label={saved ? t("vocab.unsave") : t("vocab.save")}
          onClick={() => onToggleSave(w)}
          aria-pressed={saved}
          className={saved ? "bg-teal/15 text-teal hover:bg-teal/25 hover:text-teal" : ""}
        >
          {saved ? <BookmarkCheck className="size-[18px]" /> : <Bookmark className="size-[18px]" />}
        </IconButton>
        <IconButton label={t("vocab.hide")} onClick={() => onHide(w)} className="opacity-60 group-hover:opacity-100">
          <EyeOff className="size-[18px]" />
        </IconButton>
      </div>
    </li>
  );
}

/** The مفردات list: key words for a chapter (or the whole book). */
export default function VocabList({ groups, savedSet, onToggleSave, onHide, onRestore, onSaveAll, onRegenerate, regenerating }) {
  const { t } = useI18n();
  const [hideMeanings, setHideMeanings] = useState(false);
  const visible = groups.flatMap((g) => g.words.filter((w) => !w.hidden));
  const hidden = groups.flatMap((g) => g.words.filter((w) => w.hidden));
  const unsaved = visible.filter((w) => !savedSet.has((w.lemma || w.word).toLowerCase()));
  const savedCount = visible.length - unsaved.length;

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{t("vocab.count", { n: visible.length })}</span>
          {visible.length > 0 && (
            <span className="flex items-center gap-2 text-muted">
              <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                <span className="absolute inset-y-0 start-0 rounded-full bg-teal transition-all" style={{ width: `${(savedCount / visible.length) * 100}%` }} />
              </span>
              {t("vocab.saved", { n: savedCount })}
            </span>
          )}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={hideMeanings}
            onClick={() => setHideMeanings((v) => !v)}
            title={t("vocab.quizHint")}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors ${
              hideMeanings ? "bg-violet text-white" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            <span className={`relative h-4 w-7 rounded-full transition-colors ${hideMeanings ? "bg-white/35" : "bg-line-strong"}`}>
              <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${hideMeanings ? "start-3.5" : "start-0.5"}`} />
            </span>
            {t("vocab.quiz")}
          </button>
          {unsaved.length > 0 && (
            <Button variant="soft" onClick={() => onSaveAll(unsaved)}>
              <Bookmark className="size-4" aria-hidden />
              {t("vocab.saveAll", { n: unsaved.length })}
            </Button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-3xl bg-surface p-8 text-center shadow-lift">
          <p className="text-muted">{t("vocab.empty")}</p>
          <Button className="mt-5" onClick={onRegenerate} disabled={regenerating}>
            <Sparkles className="size-4" aria-hidden />
            {regenerating ? t("vocab.picking") : t("vocab.askGemini")}
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((g) => {
            const rows = g.words.filter((w) => !w.hidden);
            if (rows.length === 0) return null;
            return (
              <div key={g.key}>
                {g.title && <h3 dir="ltr" lang="en" className="display mb-3 text-left text-lg font-bold text-primary">{g.title}</h3>}
                <ol className="grid gap-3 lg:grid-cols-2">
                  {rows.map((w) => (
                    <WordRow
                      key={w.id}
                      w={w}
                      saved={savedSet.has((w.lemma || w.word).toLowerCase())}
                      onToggleSave={onToggleSave}
                      onHide={onHide}
                      hideMeanings={hideMeanings}
                    />
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}

      {hidden.length > 0 && (
        <details className="mt-8 text-sm">
          <summary className="cursor-pointer text-muted hover:text-text">{t("vocab.hidden", { n: hidden.length })}</summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {hidden.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onRestore(w)}
                  title={t("vocab.restore")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-muted hover:text-text"
                >
                  <En>{w.word}</En>
                  <RotateCcw className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {visible.length > 0 && onRegenerate && (
        <p className="mt-10 flex flex-wrap items-center gap-2 text-sm text-muted">
          {t("vocab.notRight")}
          <button type="button" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline disabled:opacity-50" onClick={onRegenerate} disabled={regenerating}>
            <Sparkles className="size-3.5" aria-hidden />
            {regenerating ? t("vocab.picking") : t("vocab.newList")}
          </button>
        </p>
      )}
    </section>
  );
}
