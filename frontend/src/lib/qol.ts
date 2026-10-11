import type { ResponseHeader } from "@/types";

export const RESPONSE_PRESETS = [
  { key: "html", name: "HTML page", detail: "A simple page to edit and serve" },
  { key: "json", name: "JSON reply", detail: "A small API-style response" },
  {
    key: "cors",
    name: "CORS-enabled JSON",
    detail: "Allow cross-origin browser callbacks",
  },
  {
    key: "redirect",
    name: "302 redirect",
    detail: "Send the client to an HTTP(S) URL",
  },
  {
    key: "empty",
    name: "204 no content",
    detail: "A quiet, body-free callback",
  },
] as const;
export type PresetKey = (typeof RESPONSE_PRESETS)[number]["key"];

export function responsePreset(
  key: PresetKey,
  redirectTarget = "",
): { body: string; statusCode: string; headers: ResponseHeader[] } {
  if (key === "empty") return { body: "", statusCode: "204", headers: [] };
  if (key === "redirect") {
    if (/[\r\n]/.test(redirectTarget))
      throw new Error("Use an HTTP or HTTPS URL without line breaks.");
    let url: URL;
    try {
      url = new URL(redirectTarget.trim());
    } catch {
      throw new Error("Enter a complete HTTP or HTTPS URL.");
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Redirects must use HTTP or HTTPS.");
    return {
      body: "",
      statusCode: "302",
      headers: [{ header: "Location", value: url.href }],
    };
  }
  if (key === "html")
    return {
      body: '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>KebabEngineers</title></head>\n<body><h1>KebabEngineers callback received</h1></body>\n</html>\n',
      statusCode: "200",
      headers: [{ header: "Content-Type", value: "text/html; charset=utf-8" }],
    };
  const headers = [
    { header: "Content-Type", value: "application/json; charset=utf-8" },
  ];
  if (key === "cors")
    headers.push(
      { header: "Access-Control-Allow-Origin", value: "*" },
      {
        header: "Access-Control-Allow-Methods",
        value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      },
      {
        header: "Access-Control-Allow-Headers",
        value: "Content-Type, Authorization",
      },
    );
  return {
    body: JSON.stringify({ ok: true, team: "KebabEngineers" }, null, 2) + "\n",
    statusCode: "200",
    headers,
  };
}

interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  editing?: boolean;
  modal?: boolean;
}
export function shortcutAction(event: ShortcutEvent) {
  if (event.editing || event.modal || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey)
    return key === "k" && !event.shiftKey ? "search" : null;
  if (event.shiftKey && key !== "?") return null;
  const actions = {
    "/": "search",
    "?": "help",
    j: "next",
    k: "previous",
    b: "bookmark",
    c: "copy",
    p: "follow",
    "1": "requests",
    "2": "response",
    "3": "dns",
  } as const;
  return actions[key as keyof typeof actions] ?? null;
}
