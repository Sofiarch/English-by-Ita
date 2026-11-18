import { useCallback, useEffect, useState } from "react";

// Reading preferences are per device (a phone and a laptop want different sizes),
// so they live in localStorage rather than the synced database.
const KEY = "ita-reader";

export const READER_FONTS = [
  { id: "literata", css: '"Literata", Georgia, serif' },
  { id: "rubik", css: '"Rubik", system-ui, sans-serif' },
  { id: "atkinson", css: '"Atkinson Hyperlegible", "Rubik", system-ui, sans-serif' },
  { id: "georgia", css: 'Georgia, "Times New Roman", serif' },
];

export const READER_SPACING = [
  { id: "tight", value: 1.6 },
  { id: "normal", value: 1.95 },
  { id: "loose", value: 2.3 },
];

export const SIZE_MIN = 15;
export const SIZE_MAX = 30;
export const DEFAULTS = { font: "literata", size: 19, spacing: "normal" };

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return {
      font: READER_FONTS.some((f) => f.id === v?.font) ? v.font : DEFAULTS.font,
      size: Number.isFinite(v?.size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, v.size)) : DEFAULTS.size,
      spacing: READER_SPACING.some((s) => s.id === v?.spacing) ? v.spacing : DEFAULTS.spacing,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState(read);

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setSettings(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      next.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, next.size));
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* this visit only */ }
      return next;
    });
  }, []);

  const style = {
    fontFamily: READER_FONTS.find((f) => f.id === settings.font).css,
    fontSize: `${settings.size}px`,
    lineHeight: READER_SPACING.find((s) => s.id === settings.spacing).value,
  };

  return { settings, update, reset: () => update(DEFAULTS), style };
}
