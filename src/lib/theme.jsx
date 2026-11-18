import { createContext, useContext, useEffect, useState } from "react";

const KEY = "ita-theme";
const ThemeContext = createContext({ mode: "system", setMode: () => {} });

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(read);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    try {
      if (mode === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch { /* storage unavailable: theme still applies for this visit */ }

    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    meta?.setAttribute("content", dark ? "#111214" : "#F5F6FA");
  }, [mode]);

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
