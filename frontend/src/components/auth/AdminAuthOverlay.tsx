import { useState } from "react";
import { KebabMark } from "@/components/layout/KebabMark";
import { Eye, EyeOff } from "lucide-react";
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
    <div
      className="signin"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-title"
    >
      <form onSubmit={handleSubmit}>
        <div className="wordmark" id="signin-title">
          <KebabMark className="h-11 w-11" />
          <span className="flex items-baseline">
            <b>Kebab</b>
            <i>Req</i>
          </span>
        </div>
        <p>
          Catches HTTP, DNS and SMTP callbacks. Sign in with the shared team
          password.
        </p>

        <label htmlFor="admin-password">Password</label>
        <div className="pw" data-invalid={!!authError}>
          <input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            autoComplete="current-password"
            autoFocus
            aria-invalid={!!authError}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            type="button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {authError && <div className="err">{authError}</div>}

        <button
          type="submit"
          className="submit"
          disabled={!password.trim() || isSubmitting}
        >
          {isSubmitting ? "Checking…" : "Open a session"}
        </button>
        <small>
          Built on{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/adrgs/requestrepo"
            target="_blank"
            rel="noreferrer"
          >
            requestrepo
          </a>
          .
        </small>
      </form>
    </div>
  );
}
