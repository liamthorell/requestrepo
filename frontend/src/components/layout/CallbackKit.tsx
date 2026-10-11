import { useState } from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import { useLabStore } from "@/stores/labStore";
import { callbackSnippets } from "@/lib/lab";
import { getBaseDomain, getDnsDomain } from "@/lib/config";
import { copyToClipboard } from "@/lib/utils";

export function SnippetCards() {
  const subdomain = useSessionStore((s) => s.activeSubdomain);
  const scheme = useLabStore((s) => s.scheme);
  const snippets = callbackSnippets(
    `${subdomain ?? "SESSION"}.${getBaseDomain()}`,
    `${subdomain ?? "SESSION"}.${getDnsDomain()}`,
    scheme,
  );
  return (
    <div className="snippet-grid">
      {snippets.map((snippet) => (
        <div key={snippet.label} className="snippet-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3>{snippet.label}</h3>
              <p>{snippet.detail}</p>
            </div>
            <Button
              aria-label={`Copy ${snippet.label}`}
              isIconOnly
              size="sm"
              variant="light"
              isDisabled={!subdomain}
              onPress={async () => {
                await copyToClipboard(snippet.code);
                toast.success(`${snippet.label} copied`);
              }}
            >
              <Copy size={15} />
            </Button>
          </div>
          <code>{snippet.code}</code>
        </div>
      ))}
    </div>
  );
}

export function CallbackKit() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        aria-label="Callback snippets"
        size="sm"
        variant="bordered"
        className="min-w-8 px-2 sm:min-w-20 sm:px-3"
        startContent={<Terminal size={15} />}
        onPress={() => setOpen(true)}
      >
        <span className="hidden sm:inline">Snippets</span>
      </Button>
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        size="3xl"
        scrollBehavior="inside"
        backdrop="blur"
      >
        <ModalContent>
          <ModalHeader className="flex-col gap-1">
            <span>Callback cookbook</span>
            <span className="text-sm font-normal text-default-500">
              Ready to copy, using your active session and chosen HTTP scheme.
            </span>
          </ModalHeader>
          <ModalBody>
            <SnippetCards />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
