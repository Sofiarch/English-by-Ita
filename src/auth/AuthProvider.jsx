import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { startLocal, stopLocal } from "../lib/sync.js";

const AuthContext = createContext({ session: null, user: null, loading: true });

/**
 * Tracks the Supabase session and opens this user's on-device database
 * before any page renders. The saved session works offline too.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    const apply = async (s) => {
      if (s?.user) await startLocal(s.user.id).catch((e) => console.error("[local db]", e));
      else stopLocal();
      if (!alive) return;
      setSession(s);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => { apply(s); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
