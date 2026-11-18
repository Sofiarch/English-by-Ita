import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { I18nProvider } from "./lib/i18n.jsx";
import { ThemeProvider } from "./lib/theme.jsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Caches the app so it opens offline (production builds only).
registerSW({ immediate: true });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
