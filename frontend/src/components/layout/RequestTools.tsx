import { Input } from "@heroui/react";
import { Bookmark, Download } from "lucide-react";
import { useRequestStore } from "@/stores/requestStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import { useLabStore } from "@/stores/labStore";
import { downloadEvidence } from "@/lib/lab";

export function RequestTools() {
  const subdomain = useSessionStore((s) => s.activeSubdomain);
  const allRequests = useRequestStore((s) => s.requests);
  const selectedId = useUiStore((s) => s.selectedRequestId);
  const sharedRequest = useUiStore((s) => s.sharedRequest);
  const bookmarks = useLabStore((s) => s.bookmarks);
  const notes = useLabStore((s) => s.notes);
  const toggleBookmark = useLabStore((s) => s.toggleBookmark);
  const setNote = useLabStore((s) => s.setNote);
  if (!subdomain || sharedRequest) return null;
  const request = allRequests[subdomain]?.find((r) => r._id === selectedId);
  if (!request) return null;
  const saved = !!bookmarks[subdomain]?.[request._id];
  return (
    <div className="request-tools">
      <button
        type="button"
        className="text-btn"
        aria-pressed={saved}
        onClick={() => toggleBookmark(subdomain, request._id)}
      >
        <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
        {saved ? "Bookmarked" : "Bookmark"}
      </button>
      <Input
        aria-label="Evidence note"
        placeholder="Note for the write-up"
        maxLength={4000}
        size="sm"
        variant="bordered"
        value={notes[subdomain]?.[request._id] ?? ""}
        onValueChange={(note) => setNote(subdomain, request._id, note)}
        className="min-w-0 flex-1"
        classNames={{ inputWrapper: "bg-[var(--lab-surface)]" }}
      />
      <button
        type="button"
        className="text-btn"
        aria-label="Export selected request"
        onClick={() =>
          downloadEvidence(
            subdomain,
            [request],
            bookmarks[subdomain] ?? {},
            notes[subdomain] ?? {},
          )
        }
      >
        <Download size={14} />
        Export
      </button>
    </div>
  );
}
