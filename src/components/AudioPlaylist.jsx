import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ListMusic, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { mediaUrl } from "../lib/data.js";
import { useI18n } from "../lib/i18n.jsx";
import { ErrorNote, Segmented, Spinner } from "./ui.jsx";

const posKey = (bookId) => `ita-audio-${bookId}`;

function readPos(bookId, count) {
  try {
    const v = JSON.parse(localStorage.getItem(posKey(bookId)));
    if (Number.isInteger(v?.track) && v.track >= 0 && v.track < count) return { track: v.track, time: Number(v.time) || 0 };
  } catch { /* ignore */ }
  return { track: 0, time: 0 };
}

const cleanName = (name) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");

/**
 * Plays a book's audio clips one after another. Remembers the clip and the
 * spot on this device, and downloads the next clip ahead of time.
 */
export default function AudioPlaylist({ bookId, tracks }) {
  const { t } = useI18n();
  const start = useRef(readPos(bookId, tracks.length));
  const [index, setIndex] = useState(start.current.track);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [rate, setRate] = useState(1);
  const [showList, setShowList] = useState(false);
  const audio = useRef(null);
  const autoplay = useRef(false);
  const resumeAt = useRef(start.current.time);
  const lastSave = useRef(0);

  const track = tracks[index];

  useEffect(() => {
    if (!track) return;
    let alive = true;
    setUrl(null);
    setError(null);
    mediaUrl(track.path).then((u) => alive && setUrl(u)).catch((e) => alive && setError(e));
    if (tracks[index + 1]) mediaUrl(tracks[index + 1].path).catch(() => {}); // fetch + keep the next clip
    return () => { alive = false; };
  }, [track, tracks, index]);

  useEffect(() => { if (audio.current) audio.current.playbackRate = rate; }, [rate, url]);

  const save = useCallback((time) => {
    try { localStorage.setItem(posKey(bookId), JSON.stringify({ track: index, time: Math.floor(time) })); } catch { /* ignore */ }
  }, [bookId, index]);

  const go = (i, play = true) => {
    if (i < 0 || i >= tracks.length) return;
    autoplay.current = play;
    resumeAt.current = 0;
    setIndex(i);
    save(0);
    setShowList(false);
  };

  const onLoaded = () => {
    const el = audio.current;
    el.playbackRate = rate;
    if (resumeAt.current === -1 && el.duration) el.currentTime = Math.max(0, el.duration - 5);
    else if (resumeAt.current > 0 && resumeAt.current < (el.duration || Infinity) - 1) el.currentTime = resumeAt.current;
    resumeAt.current = 0;
    if (autoplay.current) el.play().catch(() => {});
    autoplay.current = false;
  };

  const onTime = () => {
    const now = Date.now();
    if (now - lastSave.current > 3000) { lastSave.current = now; save(audio.current.currentTime); }
  };

  const onEnded = () => {
    if (index < tracks.length - 1) go(index + 1, true); // next clip starts by itself
    else save(0);
  };

  /** Jump `d` seconds; going back past the start of a clip continues in the previous one. */
  const seek = useCallback((d) => {
    const el = audio.current;
    if (!el) return;
    const target = el.currentTime + d;
    if (target < 0 && index > 0 && el.currentTime < 1) {
      autoplay.current = !el.paused;
      resumeAt.current = -1; // = 5s before the end of the previous clip (set in onLoaded)
      setIndex(index - 1);
      return;
    }
    el.currentTime = Math.max(0, Math.min(target, (el.duration || target) - 0.05));
    if (target >= (el.duration || Infinity)) onEnded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ← / → on the keyboard (not while typing).
  useEffect(() => {
    const onKey = (e) => {
      // Skip when typing, or when the native player has focus (it already seeks with the arrows).
      if (e.target.closest?.("input, textarea, audio, [contenteditable]") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(e.key === "ArrowRight" ? 5 : -5);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek]);

  if (!tracks.length) return null;
  const many = tracks.length > 1;
  const skipBtn = "relative flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:bg-line disabled:opacity-35";

  return (
    <div className="sticky top-[4.5rem] z-20 mx-auto max-w-3xl rounded-3xl border border-line bg-surface/92 p-3 shadow-lift backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2" dir="ltr">
        {many && (
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("player.prev")} title={t("player.prev")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:bg-line disabled:opacity-35">
            <SkipBack className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => seek(-5)} disabled={!url} aria-label={t("player.back5")} title={`${t("player.back5")} (←)`} className={skipBtn}>
          <RotateCcw className="size-[18px]" aria-hidden />
          <span className="absolute text-[8px] font-bold">5</span>
        </button>
        {error ? (
          <div className="min-w-0 flex-1"><ErrorNote error={error} /></div>
        ) : url ? (
          <audio
            key={url}
            ref={audio}
            src={url}
            controls
            preload="metadata"
            onLoadedMetadata={onLoaded}
            onTimeUpdate={onTime}
            onPause={() => audio.current && save(audio.current.currentTime)}
            onEnded={onEnded}
            className="h-10 min-w-0 flex-1 basis-48"
          />
        ) : (
          <div className="flex h-10 flex-1 items-center px-3"><Spinner /></div>
        )}
        <button type="button" onClick={() => seek(5)} disabled={!url} aria-label={t("player.fwd5")} title={`${t("player.fwd5")} (→)`} className={skipBtn}>
          <RotateCw className="size-[18px]" aria-hidden />
          <span className="absolute text-[8px] font-bold">5</span>
        </button>
        {many && (
          <button type="button" onClick={() => go(index + 1)} disabled={index === tracks.length - 1} aria-label={t("player.next")} title={t("player.next")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:bg-line disabled:opacity-35">
            <SkipForward className="size-4" />
          </button>
        )}
        <Segmented size="sm" label={t("book.speed")} value={rate} onChange={setRate} options={[0.75, 1, 1.25].map((r) => ({ value: r, label: `${r}×` }))} />
      </div>

      {many && (
        <div className="mt-2 px-1">
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2"
          >
            <ListMusic className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="font-medium">{t("player.clip", { i: index + 1, n: tracks.length })}</span>
            <bdi dir="ltr" className="min-w-0 flex-1 truncate text-start text-muted">{cleanName(track.name)}</bdi>
            <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${showList ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showList && (
            <ol className="rise mt-1 max-h-64 overflow-y-auto rounded-2xl bg-surface-2/60 p-1">
              {tracks.map((tr, i) => (
                <li key={tr.path}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={i === index ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm ${i === index ? "bg-surface font-medium text-primary shadow-lift" : "hover:bg-surface"}`}
                  >
                    <span className="w-5 shrink-0 text-center text-xs text-muted tabular-nums" dir="ltr">{i + 1}</span>
                    <bdi dir="ltr" className="min-w-0 flex-1 truncate">{cleanName(tr.name)}</bdi>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
