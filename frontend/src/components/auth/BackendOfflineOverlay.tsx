import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
} from "@heroui/react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { apiClient, isAdminRequiredError } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";

export function BackendOfflineOverlay() {
  const [isRetrying, setIsRetrying] = useState(false);
  const setBackendOffline = useAuthStore((s) => s.setBackendOffline);
  const setShowAuthOverlay = useAuthStore((s) => s.setShowAuthOverlay);
  const addSession = useSessionStore((s) => s.addSession);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const response = await apiClient.createSession();
      setBackendOffline(false);
      addSession({
        subdomain: response.subdomain,
        token: response.token,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isAdminRequiredError(error)) {
        setBackendOffline(false);
        setShowAuthOverlay(true);
      }
      // Still offline, keep showing this overlay
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      hideCloseButton
      isDismissable={false}
      classNames={{
        backdrop: "bg-[var(--lab-bg)]",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-danger" />
            <span>Can’t reach the server</span>
          </div>
        </ModalHeader>
        <ModalBody className="pb-6">
          <p className="text-sm text-default-500 mb-4">
            The requestrepo backend isn’t answering. It may be restarting after
            a deploy; try again in a moment.
          </p>

          <Button
            color="primary"
            onPress={handleRetry}
            isLoading={isRetrying}
            startContent={!isRetrying && <RefreshCw className="h-4 w-4" />}
            className="w-full"
          >
            {isRetrying ? "Connecting…" : "Try again"}
          </Button>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
