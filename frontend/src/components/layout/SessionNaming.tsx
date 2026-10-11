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
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Name session"
          isDisabled={!subdomain}
          onPress={() => {
            if (subdomain) {
              setDraft(labels[subdomain] ?? "");
              setEditing(subdomain);
            }
          }}
        >
          <Tag size={16} />
        </Button>
      </Tooltip>
      <Modal
        isOpen={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        size="md"
        backdrop="blur"
      >
        <ModalContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (editing) setLabel(editing, draft);
              setEditing(null);
              toast.success("Session label saved");
            }}
          >
            <ModalHeader>Name this session</ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-500">
                Keep challenge URLs easy to recognize. Labels are saved in this
                browser and shared between its tabs.
              </p>
              <Input
                label="Session label"
                placeholder="e.g. SSRF warmup"
                maxLength={48}
                value={draft}
                onValueChange={setDraft}
                autoFocus
              />
              <code className="rounded-lg bg-default-100 p-3 text-xs break-all">
                {editing}.{getBaseDomain()}
              </code>
              <p className="text-xs text-default-500">
                The callback URL stays the same. Clear the label to display the
                session ID again.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setEditing(null)}>
                Cancel
              </Button>
              <Button color="primary" type="submit">
                Save label
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
}
