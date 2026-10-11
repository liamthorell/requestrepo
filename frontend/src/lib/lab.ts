import type { Request } from "@/types";

export function matchesRequest(request: Request, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  let decoded = "";
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(request.raw), (c) => c.charCodeAt(0)),
    );
  } catch {
    /* Some captured payloads aren't base64. Search the other fields. */
  }
  return `${JSON.stringify(request)} ${decoded}`.toLowerCase().includes(needle);
}

export function callbackSnippets(
  httpDomain: string,
  dnsDomain: string,
  scheme: "http" | "https",
) {
  const url = `${scheme}://${httpDomain}`;
  return [
    {
      label: "HTTP callback",
      detail: "A quick connection check",
      code: `curl '${url}/probe'`,
    },
    {
      label: "POST data",
      detail: "Send output into the queue",
      code: `printf 'hello kebab' | curl --data-binary @- '${url}/capture'`,
    },
    {
      label: "DNS callback",
      detail: "Observe an out-of-band lookup",
      code: `nslookup probe.${dnsDomain}`,
    },
    {
      label: "Browser fetch",
      detail: "Fire a callback from JavaScript",
      code: `fetch('${url}/probe', {mode: 'no-cors'})`,
    },
    {
      label: "Image beacon",
      detail: "A simple HTML callback",
      code: `<img src="${url}/beacon" alt="">`,
    },
    {
      label: "SMTP callback",
      detail: "Capture a test email",
      code: `swaks --to test@${dnsDomain} --from ctf@example.com --server ${dnsDomain.split(".").slice(1).join(".")} --port 25`,
    },
  ];
}

export function createEvidence(
  subdomain: string,
  requests: Request[],
  bookmarks: Record<string, boolean>,
  notes: Record<string, string>,
) {
  return {
    format: "kebabengineers-requestlab-v1",
    exportedAt: new Date().toISOString(),
    subdomain,
    requests: requests.map((request) => ({
      ...request,
      bookmarked: !!bookmarks[request._id],
      note: notes[request._id] ?? "",
    })),
  };
}

export function downloadEvidence(
  subdomain: string,
  requests: Request[],
  bookmarks: Record<string, boolean>,
  notes: Record<string, string>,
) {
  const blob = new Blob(
    [
      JSON.stringify(
        createEvidence(subdomain, requests, bookmarks, notes),
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kebab-${subdomain}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
