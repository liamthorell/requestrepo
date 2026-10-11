import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import * as Sentry from "@sentry/react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import App from "./App";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import "flag-icons/css/flag-icons.min.css";

// Use locally bundled Monaco instead of CDN (jsdelivr is blocked in some regions)
loader.config({ monaco });

// Editor colours follow the app palette (index.css).
monaco.editor.defineTheme("kebab-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b6058" },
    { token: "string", foreground: "95c286" },
    { token: "keyword", foreground: "f07457" },
    { token: "number", foreground: "e3b350" },
    { token: "tag", foreground: "f07457" },
    { token: "attribute.name", foreground: "e3b350" },
  ],
  colors: {
    "editor.background": "#1a1614",
    "editor.foreground": "#ede5d9",
    "editorLineNumber.foreground": "#4d433c",
    "editorLineNumber.activeForeground": "#9a8d80",
    "editor.lineHighlightBackground": "#221d1a",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#e04a2c40",
    "editorCursor.foreground": "#e04a2c",
    "editorIndentGuide.background1": "#2f2824",
  },
});
monaco.editor.defineTheme("kebab-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "a39483" },
    { token: "string", foreground: "3f7d33" },
    { token: "keyword", foreground: "b0331b" },
    { token: "number", foreground: "946500" },
    { token: "tag", foreground: "b0331b" },
    { token: "attribute.name", foreground: "946500" },
  ],
  colors: {
    "editor.background": "#fbf8f2",
    "editor.foreground": "#1f1915",
    "editorLineNumber.foreground": "#c9bcaa",
    "editorLineNumber.activeForeground": "#74675b",
    "editor.lineHighlightBackground": "#f4efe6",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#c43a2030",
    "editorCursor.foreground": "#c43a20",
  },
});

// Pre-initialize Monaco - catches init errors at the source
loader.init().catch(() => {
  // Silently handle initialization errors (e.g., if canceled during navigation)
});

// Initialize Sentry for error tracking (if DSN is configured at runtime)
// Config is injected into index.html by the backend at runtime
declare global {
  interface Window {
    __CONFIG__?: {
      DOMAIN?: string;
      SENTRY_DSN_FRONTEND?: string;
      DANGEROUSLY_ALLOW_SAME_ORIGIN_USER_CONTENT?: boolean;
    };
  }
}

const scrubSensitiveParams = (url: string): string => {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.delete("token");
    u.searchParams.delete("share");
    u.searchParams.delete("request");
    u.pathname = u.pathname.replace(
      /\/api\/v2\/requests\/shared\/[^/]+$/,
      "/api/v2/requests/shared/<redacted>",
    );
    return u.toString();
  } catch {
    return url;
  }
};

if (window.__CONFIG__?.SENTRY_DSN_FRONTEND) {
  Sentry.init({
    dsn: window.__CONFIG__.SENTRY_DSN_FRONTEND,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data?.url)
        breadcrumb.data.url = scrubSensitiveParams(breadcrumb.data.url);
      if (breadcrumb.data?.from)
        breadcrumb.data.from = scrubSensitiveParams(breadcrumb.data.from);
      if (breadcrumb.data?.to)
        breadcrumb.data.to = scrubSensitiveParams(breadcrumb.data.to);
      return breadcrumb;
    },
    beforeSend(event, hint) {
      const error = hint.originalException;
      // Filter out Monaco editor cancellation errors (expected during navigation/disposal)
      if (
        error instanceof Error &&
        (error.name === "Canceled" || error.message === "Canceled")
      ) {
        return null;
      }
      // Filter out Monaco worker load errors (already handled locally)
      if (
        error instanceof ErrorEvent ||
        (error instanceof Event && error.type === "error")
      ) {
        return null;
      }
      if (event.request?.url) {
        event.request.url = scrubSensitiveParams(event.request.url);
      }
      return event;
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// Suppress Monaco's expected cancellation errors during navigation
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  // Monaco throws "Canceled" when editor is disposed mid-initialization
  if (error?.message === "Canceled" || error?.name === "Canceled") {
    event.preventDefault();
    return;
  }
  // Monaco throws Event objects when DOM events fail during init
  if (error instanceof Event && error.type === "error") {
    event.preventDefault();
    return;
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HeroUIProvider>
          <App />
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{ className: "lab-toast" }}
          />
        </HeroUIProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
