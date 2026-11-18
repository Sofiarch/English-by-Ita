import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { BookMarked, CloudCheck, CloudOff, GraduationCap, Layers, LibraryBig, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { LangSwitch, Logo, ThemeSwitch } from "./ui.jsx";
import { countDue } from "../lib/data.js";
import { syncNow } from "../lib/sync.js";
import { useSyncStatus } from "../lib/useSync.js";

function useDueCount() {
  const [due, setDue] = useState(0);
  const { pathname } = useLocation();
  const { version } = useSyncStatus();
  useEffect(() => {
    let alive = true;
    countDue().then((n) => alive && setDue(n)).catch(() => {});
    return () => { alive = false; };
  }, [pathname, version]);
  return due;
}

/** Offline / waiting-to-sync / syncing / synced — tap to sync now. */
function SyncBadge() {
  const { t } = useI18n();
  const { online, syncing, pending, error } = useSyncStatus();

  let icon, label, tone;
  if (!online) {
    icon = <CloudOff className="size-4" aria-hidden />;
    label = pending ? t("sync.offlinePending", { n: pending }) : t("sync.offline");
    tone = "bg-yellow/20 text-text";
  } else if (syncing || pending) {
    icon = <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />;
    label = pending ? t("sync.pending", { n: pending }) : t("sync.syncing");
    tone = "bg-surface-2 text-muted";
  } else {
    icon = <CloudCheck className="size-4" aria-hidden />;
    label = error ? t("sync.error") : t("sync.synced");
    tone = error ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted";
  }

  const compact = online && !pending && !syncing && !error;
  return (
    <button
      type="button"
      onClick={() => syncNow()}
      disabled={!online}
      title={`${label}${online ? ` — ${t("sync.syncNow")}` : ""}`}
      aria-label={label}
      aria-live="polite"
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${tone} ${compact ? "w-8 justify-center px-0" : ""}`}
    >
      {icon}
      {!compact && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

function AccountMenu() {
  const { user } = useAuth();
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

  const initial = (user?.email || "?")[0].toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user?.email}
        onClick={() => setOpen((o) => !o)}
        className="display flex size-8 items-center justify-center rounded-full bg-pink text-sm font-bold text-white transition-transform hover:scale-105"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="rise absolute end-0 top-11 z-50 w-60 rounded-2xl border border-line bg-surface p-2 shadow-lift">
          <p dir="ltr" className="truncate px-3 py-2 text-start text-xs text-muted">{user?.email}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => supabase.auth.signOut()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-text hover:bg-surface-2"
          >
            <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { t } = useI18n();
  const due = useDueCount();

  const items = [
    { to: "/", end: true, label: t("nav.library"), icon: LibraryBig },
    { to: "/words", label: t("nav.words"), icon: BookMarked },
    { to: "/review", label: t("nav.review"), icon: Layers, badge: due },
    { to: "/quiz", label: t("nav.quiz"), icon: GraduationCap },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" aria-label="English by Ita" className="shrink-0"><Logo /></Link>

          <nav aria-label={t("nav.label")} className="mx-auto hidden items-center gap-1 rounded-full bg-surface-2 p-1 md:flex">
            {items.map(({ to, end, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-all ${
                    isActive ? "bg-surface font-medium text-text shadow-lift" : "text-muted hover:text-text"
                  }`
                }
              >
                {label}
                {badge > 0 && (
                  <span className="rounded-full bg-yellow px-1.5 text-[11px] font-semibold leading-5 text-[#151838]">{badge}</span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2 md:ms-0">
            <SyncBadge />
            <LangSwitch />
            <ThemeSwitch />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-32 sm:pt-10 md:pb-20">
        <Outlet />
      </main>

      {/* Phone tab bar */}
      <nav
        aria-label={t("nav.label")}
        className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-3xl border border-line bg-surface/90 p-1.5 shadow-lift backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        {items.map(({ to, end, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] transition-colors ${
                isActive ? "bg-surface-2 font-medium text-text" : "text-muted"
              }`
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
            {badge > 0 && (
              <span className="absolute top-1 start-[calc(50%+6px)] rounded-full bg-yellow px-1.5 text-[10px] font-semibold leading-4 text-[#151838]">{badge}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
