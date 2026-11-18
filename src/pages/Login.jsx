import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useI18n } from "../lib/i18n.jsx";
import { Button, Cover, ErrorNote, LangSwitch, Logo, ThemeSwitch } from "../components/ui.jsx";

// Floating word chips for the hero — real entries in the shape the app produces.
const CHIPS = [
  { en: "lighthouse", ar: "منارة", ink: "var(--blue)", pos: "top-[12%] start-[8%]", tilt: "-rotate-3" },
  { en: "brave", ar: "شجاع", ink: "var(--yellow)", pos: "top-[40%] end-[6%]", tilt: "rotate-2" },
  { en: "seamless", ar: "سلس", ink: "var(--pink)", pos: "bottom-[14%] start-[14%]", tilt: "rotate-1" },
];

function Hero() {
  return (
    <div className="relative aspect-[16/11] w-full overflow-hidden rounded-[2rem] shadow-lift sm:aspect-[5/4] lg:aspect-[4/5]">
      <Cover seed="english-by-ita-hero-7" className="absolute inset-0 size-full" />
      {CHIPS.map((c) => (
        <div
          key={c.en}
          className={`absolute ${c.pos} ${c.tilt} flex items-center gap-3 rounded-2xl bg-surface/95 px-4 py-2.5 shadow-lift backdrop-blur`}
        >
          <span className="size-2.5 rounded-full" style={{ background: c.ink }} aria-hidden />
          <bdi dir="ltr" lang="en" className="font-read text-lg font-semibold">{c.en}</bdi>
          <bdi dir="rtl" lang="ar" className="text-muted">{c.ar}</bdi>
        </div>
      ))}
    </div>
  );
}

export default function Login() {
  const { t } = useI18n();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice("");
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) {
      setError(
        /Invalid login/i.test(error.message) ? t("login.badCreds")
          : /Email not confirmed/i.test(error.message) ? t("login.unconfirmed")
            : error.message,
      );
      return;
    }
    if (mode === "signup" && !data.session) {
      setNotice(t("login.checkEmail"));
      setMode("signin");
    }
  }

  const input = "w-full rounded-2xl border border-line bg-bg px-4 py-3 text-text outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <div className="ms-auto flex items-center gap-2">
          <LangSwitch />
          <ThemeSwitch />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-4 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-10">
        <section>
          <h1 className="display text-4xl leading-[1.15] font-bold sm:text-5xl lg:text-[3.5rem]">
            <span className="block">{t("login.line1")}</span>
            <span className="overprint block">{t("login.line2")}</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">{t("login.lead")}</p>

          <form onSubmit={submit} className="mt-8 max-w-md space-y-4 rounded-[1.75rem] border border-line bg-surface p-6 shadow-lift sm:p-7">
            <h2 className="text-lg font-semibold">{mode === "signin" ? t("login.signin") : t("login.signup")}</h2>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">{t("login.email")}</span>
              <input className={input} dir="ltr" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">{t("login.password")}</span>
              <input
                className={input}
                dir="ltr"
                type="password"
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorNote error={error} />
            {notice && <p className="rounded-2xl bg-teal/12 px-4 py-3 text-sm text-teal">{notice}</p>}
            <Button type="submit" className="w-full py-3" disabled={busy}>
              {busy ? t("login.busy") : mode === "signin" ? t("login.submitIn") : t("login.submitUp")}
            </Button>
            <p className="text-center text-sm text-muted">
              {mode === "signin" ? t("login.noAccount") : t("login.haveAccount")}{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
              >
                {mode === "signin" ? t("login.createOne") : t("login.signInLink")}
              </button>
            </p>
          </form>
        </section>

        <div>
          <Hero />
        </div>
      </main>
    </div>
  );
}
