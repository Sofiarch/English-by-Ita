import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Type } from "lucide-react";
import { useI18n } from "../lib/i18n.jsx";
import { READER_FONTS, READER_SPACING, SIZE_MAX, SIZE_MIN } from "../lib/readerSettings.js";
import { Segmented } from "./ui.jsx";

/** "Aa" button + popover: font family, text size, line spacing. */
export default function ReaderSettings({ settings, update, reset }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const step = (d) => update({ size: settings.size + d });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t("reader.settings")}
        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
          open ? "bg-primary text-on-primary" : "bg-surface-2 text-text hover:bg-line"
        }`}
      >
        <Type className="size-4" aria-hidden />
        <span dir="ltr" className="font-read">Aa</span>
        <span className="hidden sm:inline">{t("reader.settings")}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("reader.settings")}
          className="rise absolute end-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        >
          {/* Font */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">{t("reader.font")}</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("reader.font")}>
              {READER_FONTS.map((f) => {
                const on = settings.font === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => update({ font: f.id })}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-start transition-all ${
                      on ? "border-primary bg-primary/8" : "border-transparent bg-surface-2 hover:border-line-strong"
                    }`}
                  >
                    <span dir="ltr" className="text-2xl leading-none" style={{ fontFamily: f.css }}>Aa</span>
                    <span className="text-sm">{t(`reader.font.${f.id}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted">{t("reader.size")}</p>
              <span className="text-xs text-muted tabular-nums" dir="ltr">{settings.size}px</span>
            </div>
            <div className="flex items-center gap-3" dir="ltr">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={settings.size <= SIZE_MIN}
                aria-label={t("reader.smaller")}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:bg-line disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <input
                type="range"
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={1}
                value={settings.size}
                onChange={(e) => update({ size: Number(e.target.value) })}
                aria-label={t("reader.size")}
                className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => step(1)}
                disabled={settings.size >= SIZE_MAX}
                aria-label={t("reader.larger")}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:bg-line disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* Line spacing */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">{t("reader.spacing")}</p>
            <Segmented
              size="sm"
              label={t("reader.spacing")}
              value={settings.spacing}
              onChange={(v) => update({ spacing: v })}
              options={READER_SPACING.map((s) => ({ value: s.id, label: t(`reader.spacing.${s.id}`) }))}
            />
          </div>

          <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-text">
            <RotateCcw className="size-3.5" aria-hidden /> {t("reader.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
