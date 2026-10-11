import { useState } from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import { useAuthStore } from "@/stores/authStore";
import { useLabStore } from "@/stores/labStore";
import { apiClient, apiErrorMessage, isAdminRequiredError } from "@/api/client";
import { getBaseDomain } from "@/lib/config";

// "new" adds a session; "replace" swaps the active session's URL in place.
export function SessionDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: "new" | "replace";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSubdomain = useSessionStore((s) => s.activeSubdomain);
  const addSession = useSessionStore((s) => s.addSession);
  const replaceSession = useSessionStore((s) => s.replaceSession);
  const moveSessionLabel = useLabStore((s) => s.moveSessionLabel);
  const setShowAuthOverlay = useAuthStore((s) => s.setShowAuthOverlay);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const active = sessions.find((s) => s.subdomain === activeSubdomain);
  const cleaned = name.trim().toLowerCase();

  const close = () => {
    setName("");
    setError("");
    onOpenChange(false);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiClient.createSession(
        undefined,
        cleaned || undefined,
      );
      const session = {
        subdomain: response.subdomain,
        token: response.token,
        createdAt: new Date().toISOString(),
        ...(cleaned ? { custom: true } : {}),
      };
      if (mode === "replace" && active) {
        replaceSession(active.subdomain, session);
        moveSessionLabel(active.subdomain, session.subdomain);
        if (active.custom)
          apiClient.releaseSession(active.token).catch(() => {});
      } else {
        addSession(session);
      }
      toast.success(`Listening on ${response.subdomain}.${getBaseDomain()}`);
      close();
    } catch (failure) {
      if (isAdminRequiredError(failure)) {
        close();
        setShowAuthOverlay(true);
      } else {
        setError(apiErrorMessage(failure, "Couldn’t create the URL."));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      size="md"
    >
      <ModalContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ModalHeader>
            {mode === "new" ? "New session" : "New URL for this session"}
          </ModalHeader>
          <ModalBody>
            <label className="text-sm font-medium" htmlFor="session-name">
              Name
            </label>
            <div className="name-field" data-invalid={!!error}>
              <input
                id="session-name"
                aria-label="Subdomain name"
                placeholder="random"
                value={name}
                maxLength={32}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setName(event.target.value.replace(/[^a-zA-Z0-9-]/g, ""));
                  setError("");
                }}
              />
              <span>.{getBaseDomain()}</span>
            </div>
            {error ? (
              <p className="text-sm text-[var(--m-delete)]">{error}</p>
            ) : (
              <p className="text-xs text-default-500">
                Leave empty for a random one. 3–32 letters, digits or hyphens;
                the name stays yours until you close the session.
              </p>
            )}
            {mode === "replace" && active?.custom && (
              <p className="text-xs text-default-500">
                <code>{active.subdomain}</code> will be released and what it
                captured deleted.
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={close}>
              Cancel
            </Button>
            <Button color="primary" type="submit" isLoading={busy}>
              {cleaned ? `Claim ${cleaned}` : "Get a random URL"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
