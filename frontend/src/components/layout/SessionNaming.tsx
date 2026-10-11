import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tooltip,
} from "@heroui/react";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import { useLabStore } from "@/stores/labStore";
import { getBaseDomain } from "@/lib/config";

export function SessionNaming() {
  const subdomain = useSessionStore((s) => s.activeSubdomain);
  const labels = useLabStore((s) => s.sessionLabels);
  const setLabel = useLabStore((s) => s.setSessionLabel);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <>
      <Tooltip content="Name this session">
        <button
          type="button"
          className="icon-btn"
          aria-label="Name session"
          disabled={!subdomain}
          onClick={() => {
            if (subdomain) {
              setDraft(labels[subdomain] ?? "");
              setEditing(subdomain);
            }
          }}
        >
          <Tag size={16} />
        </button>
      </Tooltip>
      <Modal
        isOpen={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        size="md"
      >
        <ModalContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (editing) setLabel(editing, draft);
              setEditing(null);
              toast.success("Label saved");
            }}
          >
            <ModalHeader>Name this session</ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-500">
                Shown on the session tab instead of the random ID. Stored in
                this browser only.
              </p>
              <Input
                label="Session label"
                placeholder="web/ssrf-me"
                maxLength={48}
                value={draft}
                onValueChange={setDraft}
                autoFocus
              />
              <p className="text-xs text-default-500">
                The URL stays{" "}
                <code className="break-all text-default-700">
                  {editing}.{getBaseDomain()}
                </code>
                . Leave the field empty to go back to the ID.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setEditing(null)}>
                Cancel
              </Button>
              <Button color="primary" type="submit">
                Save
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
}
