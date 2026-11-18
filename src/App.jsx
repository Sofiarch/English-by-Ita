import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/AuthProvider.jsx";
import { supabaseReady } from "./lib/supabase.js";
import { useI18n } from "./lib/i18n.jsx";
import Layout from "./components/Layout.jsx";
import { LangSwitch, Spinner, ThemeSwitch } from "./components/ui.jsx";
import Login from "./pages/Login.jsx";
import Library from "./pages/Library.jsx";
import AddBook from "./pages/AddBook.jsx";
import Book from "./pages/Book.jsx";
import MyWords from "./pages/MyWords.jsx";
import Review from "./pages/Review.jsx";
import Quiz from "./pages/Quiz.jsx";

function SetupNeeded() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="mb-8 flex justify-end gap-2"><LangSwitch /><ThemeSwitch /></div>
      <h1 className="display text-2xl font-bold">{t("setup.title")}</h1>
      <p className="mt-3 text-muted">{t("setup.body")}</p>
      <pre dir="ltr" className="mt-4 overflow-x-auto rounded-2xl bg-surface p-4 text-sm leading-7 shadow-lift">
{`VITE_SUPABASE_URL="https://xxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_..."`}
      </pre>
    </main>
  );
}

export default function App() {
  const { session, loading } = useAuth();

  if (!supabaseReady) return <SetupNeeded />;
  if (loading) return <Spinner full />;
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Library />} />
        <Route path="add" element={<AddBook />} />
        <Route path="book/:id" element={<Book />} />
        <Route path="words" element={<MyWords />} />
        <Route path="review" element={<Review />} />
        <Route path="quiz" element={<Quiz />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
