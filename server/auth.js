import { createClient } from "@supabase/supabase-js";

let supabase = null;
function client() {
  if (!supabase) {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return supabase;
}

export function supabaseConfigured() {
  return Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Only signed-in users may call the Gemini routes, so strangers can't spend
 * the API quota. Verifies the Supabase access token sent by the site.
 */
export async function requireUser(req, res, next) {
  const sb = client();
  if (!sb) return res.status(500).json({ code: "supabase_missing", error: "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing on the server" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ code: "login_required", error: "Sign in first" });

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ code: "session_expired", error: "Session expired" });

  req.user = data.user;
  req.accessToken = token;
  next();
}

/**
 * Downloads one of the signed-in user's files from Storage *as that user*,
 * so the bucket's security rules still apply (nobody can read others' files).
 */
export async function downloadUserFile(req, path) {
  if (!path.startsWith(`${req.user.id}/`)) {
    const err = new Error("Not your file");
    err.status = 403;
    err.code = "pdf_missing";
    throw err;
  }
  const asUser = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${req.accessToken}` } },
  });
  const { data, error } = await asUser.storage.from("book-media").download(path);
  if (error || !data) {
    const err = new Error(error?.message || "File not found");
    err.status = 404;
    err.code = "pdf_missing";
    throw err;
  }
  return Buffer.from(await data.arrayBuffer());
}
