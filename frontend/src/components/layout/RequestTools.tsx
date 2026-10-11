import { Button, Input } from "@heroui/react";
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
      <Button
        size="sm"
        variant="flat"
        color={saved ? "primary" : "default"}
        startContent={
          <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
        }
        onPress={() => toggleBookmark(subdomain, request._id)}
      >
        {saved ? "Bookmarked" : "Bookmark"}
      </Button>
      <Input
        aria-label="Evidence note"
        placeholder="Add a note for your write-up…"
        maxLength={4000}
        size="sm"
        value={notes[subdomain]?.[request._id] ?? ""}
        onValueChange={(note) => setNote(subdomain, request._id, note)}
        className="min-w-0 flex-1"
      />
      <Button
        aria-label="Export selected request"
        size="sm"
        variant="bordered"
        startContent={<Download size={15} />}
        onPress={() =>
          downloadEvidence(
            subdomain,
            [request],
            bookmarks[subdomain] ?? {},
            notes[subdomain] ?? {},
          )
        }
      >
        Export
      </Button>
    </div>
  );
}
