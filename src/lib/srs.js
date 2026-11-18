// SM-2 spaced repetition, simplified to four answer buttons.

export const GRADES = [
  { id: "again", quality: 1 },
  { id: "hard",  quality: 3 },
  { id: "good",  quality: 4 },
  { id: "easy",  quality: 5 },
];

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

/** Returns the new scheduling fields for a card after answering with `quality` (0–5). */
export function schedule(card, quality, now = new Date()) {
  let ease = card.ease ?? 2.5;
  let interval = card.interval_days ?? 0;
  let reps = card.reps ?? 0;
  let lapses = card.lapses ?? 0;
  let dueMs;

  if (quality < 3) {
    reps = 0;
    interval = 0;
    lapses += 1;
    dueMs = now.getTime() + 10 * MIN;
  } else {
    reps += 1;
    if (reps === 1) interval = quality === 5 ? 3 : 1;
    else if (reps === 2) interval = quality === 5 ? 6 : 3;
    else interval = Math.round(interval * ease * (quality === 5 ? 1.3 : quality === 3 ? 0.8 : 1));
    interval = Math.max(1, interval);
    dueMs = now.getTime() + interval * DAY;
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  return {
    ease: Number(ease.toFixed(2)),
    interval_days: interval,
    reps,
    lapses,
    due_at: new Date(dueMs).toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

const formatters = {};
const rtf = (lang) => (formatters[lang] ||= new Intl.RelativeTimeFormat(lang, { numeric: "auto" }));

/** "in 10 minutes" / "بعد 10 دقائق", "tomorrow" / "غداً"… — `nowLabel` for anything already due. */
export function describeDue(iso, lang = "ar", nowLabel = "") {
  const diff = new Date(iso).getTime() - Date.now();
  const f = rtf(lang);
  if (diff <= 0) return nowLabel || f.format(0, "second");
  if (diff < 60 * MIN) return f.format(Math.max(1, Math.round(diff / MIN)), "minute");
  if (diff < DAY) return f.format(Math.round(diff / (60 * MIN)), "hour");
  if (diff < 30 * DAY) return f.format(Math.round(diff / DAY), "day");
  return f.format(Math.round(diff / (30 * DAY)), "month");
}

export const isDue = (card, now = new Date()) => new Date(card.due_at).getTime() <= now.getTime();
