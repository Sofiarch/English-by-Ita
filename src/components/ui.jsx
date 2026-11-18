import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getLevel } from "../lib/levels.js";
import { useI18n } from "../lib/i18n.jsx";
import { useTheme } from "../lib/theme.jsx";

// ─── Text direction helpers ─────────────────────────────
// English content stays LTR and Arabic stays RTL whatever the UI language,
// while the surrounding block keeps the UI's alignment.

export function En({ children, className = "", as: Tag = "bdi" }) {
  return <Tag dir="ltr" lang="en" className={className}>{children}</Tag>;
}

export function Ar({ children, className = "" }) {
  return <bdi dir="rtl" lang="ar" className={className}>{children}</bdi>;
}

// ─── Buttons ────────────────────────────────────────────

const base =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap";

const variants = {
  primary: "bg-primary text-on-primary hover:brightness-110 px-5 py-2.5",
  soft: "bg-surface-2 text-text hover:bg-line px-4 py-2.5",
  ghost: "border border-line text-text hover:border-line-strong hover:bg-surface px-4 py-2",
  quiet: "text-muted hover:text-text hover:bg-surface-2 px-3 py-1.5",
  danger: "bg-danger/10 text-danger hover:bg-danger/20 px-4 py-2",
};

export function Button({ variant = "primary", className = "", ...props }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function IconButton({ label, className = "", children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ full = false, label }) {
  const { t } = useI18n();
  const el = (
    <span role="status" className="inline-flex items-center gap-3 text-muted">
      <span className="relative inline-flex size-4">
        <span className="absolute inset-0 animate-ping rounded-full bg-pink/40" />
        <span className="relative size-4 rounded-full bg-blue" />
      </span>
      {label ?? t("common.loading")}
    </span>
  );
  if (!full) return el;
  return <div className="flex min-h-[60dvh] items-center justify-center">{el}</div>;
}

export function LevelTag({ level, className = "" }) {
  const lv = getLevel(level);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ background: `color-mix(in srgb, ${lv.color} 16%, transparent)`, color: `color-mix(in srgb, ${lv.color} 80%, var(--text))` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: lv.color }} />
      <En>{lv.label}</En>
      <En className="opacity-70">{lv.cefr}</En>
    </span>
  );
}

export function ErrorNote({ error, onRetry }) {
  const { t, errorText } = useI18n();
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
      <span className="flex-1">{errorText(error)}</span>
      {onRetry && <Button variant="danger" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

/** A sentence with `word` marked by a thick ink underline. */
export function MarkedSentence({ sentence, word, ink, className = "" }) {
  if (!sentence) return null;
  const i = word ? sentence.toLowerCase().indexOf(word.toLowerCase()) : -1;
  return (
    <En className={`font-read ${className}`}>
      {i < 0 ? (
        sentence
      ) : (
        <>
          {sentence.slice(0, i)}
          <mark className="hl" style={ink ? { "--ink": ink } : undefined}>{sentence.slice(i, i + word.length)}</mark>
          {sentence.slice(i + word.length)}
        </>
      )}
    </En>
  );
}

// ─── Segmented control ──────────────────────────────────

export function Segmented({ value, onChange, options, label, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-1.5 text-sm";
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-full transition-all ${pad} ${
            value === o.value ? "bg-surface text-text shadow-lift" : "text-muted hover:text-text"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One button: flips between light and dark (starts from the device setting). */
export function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const isDark = mode === "dark" || (mode === "system" && systemDark);
  const label = isDark ? t("theme.light") : t("theme.dark");
  return (
    <button
      type="button"
      onClick={() => setMode(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="relative inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-text transition-colors hover:bg-line"
    >
      <Sun className={`absolute size-4 transition-all duration-300 ${isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} aria-hidden />
      <Moon className={`absolute size-4 transition-all duration-300 ${isDark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} aria-hidden />
    </button>
  );
}

export function LangSwitch() {
  const { t, toggle, lang } = useI18n();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("lang.switchLabel")}
      title={t("lang.switchLabel")}
      lang={lang === "ar" ? "en" : "ar"}
      className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-xs font-medium text-text transition-colors hover:bg-line"
    >
      {t("lang.switch")}
    </button>
  );
}

// ─── Generated riso cover ───────────────────────────────

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INKS = ["var(--blue)", "var(--pink)", "var(--yellow)", "var(--teal)"];

const arch = (x, y, w, h) => `M${x},${y + h} V${y + w / 2} A${w / 2},${w / 2} 0 0 1 ${x + w},${y + w / 2} V${y + h} Z`;

/**
 * Every book gets its own cover, generated from its id: two or three
 * overlapping shapes in riso inks that blend where they overlap.
 */
export function Cover({ seed, className = "" }) {
  const r = mulberry32(hash(String(seed)));
  const between = (a, b) => a + r() * (b - a);
  const order = [...INKS].sort(() => r() - 0.5);
  const [a, b, c] = order;
  const layout = Math.floor(r() * 4);

  let shapes;
  if (layout === 0) {
    shapes = (
      <>
        <circle cx={between(90, 210)} cy={between(120, 200)} r={between(100, 135)} fill={a} />
        <path d={arch(between(20, 120), between(190, 230), between(140, 180), 260)} fill={b} />
        <circle cx={between(200, 260)} cy={between(40, 90)} r={between(18, 30)} fill={c} />
      </>
    );
  } else if (layout === 1) {
    const y = between(150, 230);
    shapes = (
      <>
        <rect x="-20" y={y} width="340" height="70" fill={b} transform={`rotate(${between(-18, 18)} 150 ${y})`} />
        <circle cx={between(100, 200)} cy={between(110, 170)} r={between(80, 110)} fill={a} />
        <path d={`M0,400 V${between(290, 330)} A150,150 0 0 1 300,${between(290, 330)} V400 Z`} fill={c} />
      </>
    );
  } else if (layout === 2) {
    const cy = between(150, 230);
    shapes = (
      <>
        <circle cx={between(80, 120)} cy={cy} r={between(85, 105)} fill={a} />
        <circle cx={between(180, 220)} cy={cy + between(-40, 40)} r={between(85, 105)} fill={b} />
        <rect x={between(30, 90)} y={between(320, 345)} width={between(120, 200)} height="22" rx="11" fill={c} />
      </>
    );
  } else {
    shapes = (
      <>
        <path d={arch(between(40, 80), between(70, 110), between(150, 190), 360)} fill={a} />
        <circle cx={between(170, 240)} cy={between(90, 150)} r={between(50, 70)} fill={b} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x="0" y={300 + i * 26} width="300" height="11" fill={c} />
        ))}
      </>
    );
  }

  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="300" height="400" fill="var(--cover-bg)" />
      <g className="cover-ink" opacity="0.92">{shapes}</g>
    </svg>
  );
}

/** The book's real cover (page 1 of its PDF) when there is one, else a generated riso cover. */
export function BookCover({ book, src, className = "" }) {
  const url = src || book?.cover_url;
  if (url) {
    return <img src={url} alt="" loading="lazy" decoding="async" className={`bg-white object-cover object-top ${className}`} />;
  }
  return <Cover seed={book?.id || "cover"} className={className} />;
}

/**
 * The mark: an open book printed in two riso inks (burgundy + gold) that
 * overprint at the spine, with the dot of the "i" (for ita) above it.
 */
export function LogoMark({ className = "size-8" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M6 20 Q19 15.5 36 21 V55 Q19 49.5 6 54 Z" fill="#cc4a64" />
      <path d="M58 20 Q45 15.5 28 21 V55 Q45 49.5 58 54 Z" fill="#ffc23d" />
      <path d="M28 21 Q32 22.2 36 21 V55 Q32 53.8 28 55 Z" fill="#8a1f3c" />
      <circle cx="32" cy="9.5" r="5.5" fill="#34d3b4" />
    </svg>
  );
}

/** Mark + wordmark: "English by" and "ita" printed twice, slightly off-register. */
export function Logo({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} dir="ltr" lang="en">
      <LogoMark className="size-8 shrink-0 transition-transform duration-300 hover:-rotate-6" />
      <span className="inline-flex flex-col leading-none">
        <span className="text-[10px] font-medium tracking-wide text-muted">English by</span>
        <span className="display overprint text-[1.4rem] leading-none font-extrabold">ita</span>
      </span>
    </span>
  );
}
