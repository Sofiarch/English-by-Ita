import { Check } from "lucide-react";
import { useI18n } from "../lib/i18n.jsx";

const STAGES = [
  { id: "upload", ink: "var(--teal)" },
  { id: "read", ink: "var(--blue)" },
  { id: "words", ink: "var(--pink)" },
];

export default function ImportProgress({ stage }) {
  const { t } = useI18n();
  const current = STAGES.findIndex((s) => s.id === stage);
  const done = stage === "done";
  return (
    <ol className="space-y-6" aria-live="polite">
      {STAGES.map((s, i) => {
        const state = done || i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={s.id} className="flex gap-4">
            <span
              className={`relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                state === "todo" ? "bg-surface-2 text-muted" : "text-white"
              }`}
              style={state !== "todo" ? { background: s.ink } : undefined}
            >
              {state === "active" && <span className="absolute inset-0 animate-ping rounded-full opacity-30" style={{ background: s.ink }} />}
              {state === "done" ? <Check className="size-4" aria-hidden /> : <span className="relative">{i + 1}</span>}
            </span>
            <div className={`pt-1.5 ${state === "todo" ? "opacity-50" : ""}`}>
              <p className="font-semibold">{t(`stage.${s.id}`)}</p>
              <p className="text-sm text-muted">{t(`stage.${s.id}Hint`)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
