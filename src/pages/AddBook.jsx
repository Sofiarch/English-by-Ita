import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FileText, Music, X } from "lucide-react";
import { importBook, naturalSort } from "../lib/data.js";
import { renderPdfCover } from "../lib/pdfCover.js";
import { LEVELS } from "../lib/levels.js";
import { useI18n } from "../lib/i18n.jsx";
import { useSyncStatus } from "../lib/useSync.js";
import { BookCover, Button, En, ErrorNote } from "../components/ui.jsx";
import ImportProgress from "../components/ImportProgress.jsx";

const MAX_PDF_MB = 50;

function FilePick({ label, hint, accept, file, onFile, icon: Icon, ink, required, thumb }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <span className="text-sm font-medium">
        {label} {!required && <span className="font-normal text-muted">{t("common.optional")}</span>}
      </span>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className={`mt-2 flex items-center gap-4 rounded-3xl border-2 border-dashed p-4 transition-colors ${
          over ? "border-primary bg-primary/5" : file ? "border-transparent bg-surface shadow-lift" : "border-line bg-surface/60"
        }`}
      >
        {thumb ? (
          <img src={thumb.src} alt={thumb.alt} className="reveal h-16 w-12 shrink-0 rounded-lg bg-white object-cover object-top shadow-lift" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: ink }}>
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        {file ? (
          <>
            <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-sm font-medium" title={file.name}>{file.name}</span>
            <span className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" aria-label={t("add.remove")} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text" onClick={() => onFile(null)}>
              <X className="size-4" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-muted">{hint}</span>
            <Button variant="soft" onClick={() => ref.current?.click()}>{t("add.choose")}</Button>
          </>
        )}
        <input ref={ref} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0] || null)} />
      </div>
    </div>
  );
}

const isAudio = (f) => f.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(f.name);

/** Several audio clips, kept in file-name order (01, 02, … 10). */
function AudioClipsPick({ files, onChange }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const add = (list) => onChange(naturalSort([...files, ...[...(list || [])].filter(isAudio)]));
  return (
    <div>
      <span className="text-sm font-medium">{t("add.audioLabel")} <span className="font-normal text-muted">{t("common.optional")}</span></span>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`mt-2 rounded-3xl border-2 border-dashed p-4 transition-colors ${over ? "border-primary bg-primary/5" : files.length ? "border-transparent bg-surface shadow-lift" : "border-line bg-surface/60"}`}
      >
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-pink text-white"><Music className="size-5" aria-hidden /></span>
          <span className="flex-1 text-sm text-muted">{files.length ? t("add.audioCount", { n: files.length }) : t("add.audioHint")}</span>
          <Button variant="soft" onClick={() => ref.current?.click()}>{files.length ? t("edit.audioAddMany") : t("add.choose")}</Button>
        </div>
        {files.length > 0 && (
          <ol className="mt-3 space-y-1">
            {files.map((f, i) => (
              <li key={f.name + f.size + i} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-3 py-1.5 text-sm">
                <span className="w-5 text-center text-xs text-muted tabular-nums" dir="ltr">{i + 1}</span>
                <bdi dir="ltr" className="min-w-0 flex-1 truncate text-start">{f.name}</bdi>
                <span className="text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" aria-label={t("add.remove")} className="rounded-full p-1 text-muted hover:bg-surface hover:text-text" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <input ref={ref} type="file" accept="audio/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );
}

export default function AddBook() {
  const { t } = useI18n();
  const { online } = useSyncStatus();
  const navigate = useNavigate();
  const [pdfFile, setPdfFile] = useState(null);
  const [audioFiles, setAudioFiles] = useState([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [level, setLevel] = useState("level1");
  const [stage, setStage] = useState(null);
  const [error, setError] = useState(null);
  const [failedBookId, setFailedBookId] = useState(null);
  const [cover, setCover] = useState(null); // { blob, url } — page 1 of the PDF

  // Preview the real cover as soon as a PDF is picked.
  useEffect(() => {
    if (!pdfFile) return setCover(null);
    let alive = true;
    let url = null;
    renderPdfCover(pdfFile)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setCover({ blob, url });
      })
      .catch(() => alive && setCover(null)); // unreadable locally — the generated cover is used instead
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [pdfFile]);

  function pickPdf(f) {
    setError(null);
    if (f && f.type !== "application/pdf") return setError(t("add.notPdf"));
    if (f && f.size > MAX_PDF_MB * 1024 * 1024) return setError(t("add.tooBig", { mb: MAX_PDF_MB }));
    setPdfFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (!pdfFile) return setError(t("add.needPdf"));
    setError(null);
    setFailedBookId(null);
    try {
      const id = await importBook({ pdfFile, audioFiles, coverBlob: cover?.blob, title, author, level }, setStage);
      navigate(`/book/${id}`);
    } catch (err) {
      setError(err);
      setFailedBookId(err.bookId || null);
      setStage(null);
    }
  }

  const input = "w-full rounded-2xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";

  if (stage) {
    return (
      <section className="mx-auto grid max-w-3xl items-center gap-10 py-6 sm:grid-cols-[0.7fr_1fr]">
        <div className="mx-auto aspect-[3/4] w-48 overflow-hidden rounded-3xl shadow-lift sm:w-full">
          <BookCover src={cover?.url} book={{ id: pdfFile?.name || "new" }} className="size-full" />
        </div>
        <div>
          <h1 className="display text-2xl font-bold">{t("add.working")}</h1>
          <p className="mt-2 mb-8 text-sm text-muted">{t("add.stay")}</p>
          <ImportProgress stage={stage} />
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-7">
      <div>
        <h1 className="display text-3xl font-bold sm:text-4xl">{t("add.title")}</h1>
        <p className="mt-2 text-muted">{t("add.lead")}</p>
      </div>

      <FilePick label={t("add.pdfLabel")} hint={t("add.pdfHint", { mb: MAX_PDF_MB })} accept="application/pdf" file={pdfFile} onFile={pickPdf} icon={FileText} ink="var(--blue)" required thumb={cover ? { src: cover.url, alt: t("add.coverAlt") } : null} />
      <AudioClipsPick files={audioFiles} onChange={setAudioFiles} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium">{t("add.titleLabel")} <span className="font-normal text-muted">{t("common.optional")}</span></span>
          <input className={input} dir="ltr" lang="en" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("add.titlePh")} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">{t("add.authorLabel")} <span className="font-normal text-muted">{t("common.optional")}</span></span>
          <input className={input} dir="ltr" lang="en" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t("add.level")}</legend>
        <p className="mt-0.5 text-sm text-muted">{t("add.levelHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((l) => {
            const on = level === l.id;
            return (
              <label
                key={l.id}
                className={`cursor-pointer rounded-2xl border-2 px-3 py-2.5 text-sm transition-all has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30 ${
                  on ? "bg-surface shadow-lift" : "border-transparent bg-surface-2 text-muted hover:text-text"
                }`}
                style={on ? { borderColor: l.color } : undefined}
              >
                <input type="radio" name="level" value={l.id} checked={on} onChange={() => setLevel(l.id)} className="sr-only" />
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: l.color }} />
                  <En className="font-medium">{l.label}</En>
                  <En className="ms-auto text-xs opacity-70">{l.cefr}</En>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!online && <p role="status" className="rounded-2xl bg-yellow/20 px-4 py-3 text-sm">{t("add.offline")}</p>}
      <ErrorNote error={error} />
      {failedBookId && (
        <p className="text-sm text-muted">
          {t("add.savedAnyway")}{" "}
          <Link className="font-medium text-primary hover:underline" to={`/book/${failedBookId}`}>{t("add.openRetry")}</Link>
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="px-6 py-3" disabled={!pdfFile || !online}>{t("add.submit")}</Button>
        <Button variant="quiet" className="py-3" onClick={() => navigate(-1)}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}
