import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
} from "@heroui/react";
import { KebabMark } from "@/components/layout/KebabMark";
import { Lock, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

interface AdminAuthOverlayProps {
  onSubmit: (password: string) => Promise<void>;
}

export function AdminAuthOverlay({ onSubmit }: AdminAuthOverlayProps) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const authError = useAuthStore((s) => s.authError);
  const setAuthError = useAuthStore((s) => s.setAuthError);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    // Clear error when user starts typing again
    if (authError) {
      setAuthError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setAuthError(null);

    try {
      await onSubmit(password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      hideCloseButton
      isDismissable={false}
      backdrop="blur"
      classNames={{
        backdrop: "bg-black/80",
      }}
    >
      <ModalContent>
        <form onSubmit={handleSubmit}>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <KebabMark className="h-10 w-10 text-primary" />
              <div>
                <span className="eyebrow">KEBABENGINEERS</span>
                <h1 className="text-xl font-semibold">Welcome to the grill</h1>
              </div>
            </div>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500 mb-4">
              Enter the team password to start catching callbacks.
            </p>

            <Input
              type={showPassword ? "text" : "password"}
              label="Admin Password"
              placeholder="Enter admin password"
              value={password}
              onValueChange={handlePasswordChange}
              autoFocus
              isInvalid={!!authError}
              startContent={<Lock className="h-4 w-4 text-default-400" />}
              endContent={
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-default-400 hover:text-default-600" />
                  ) : (
                    <Eye className="h-4 w-4 text-default-400 hover:text-default-600" />
                  )}
                </button>
              }
            />

            {authError && (
              <div className="flex items-center gap-2 text-danger text-sm mt-2">
                <AlertCircle className="h-4 w-4" />
                <span>{authError}</span>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              type="submit"
              color="primary"
              isLoading={isSubmitting}
              isDisabled={!password.trim()}
            >
              Fire up a session
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
