import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tooltip } from "@heroui/react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import { copyToClipboard } from "@/lib/utils";
import { SessionDialog } from "./SessionDialog";
import { useLabStore } from "@/stores/labStore";
import { getBaseDomain } from "@/lib/config";

export function Toolbar() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const scheme = useLabStore((s) => s.scheme);
  const setScheme = useLabStore((s) => s.setScheme);
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useSessionStore((s) => s.sessions);
  const activeSubdomain = useSessionStore((s) => s.activeSubdomain);

  const session = sessions.find((s) => s.subdomain === activeSubdomain);
  const currentPath = location.pathname.split("/")[1] || "requests";
  const domain = getBaseDomain();
  const fullDomain = session ? `${session.subdomain}.${domain}` : domain;

  const handleCopyUrl = () => {
    copyToClipboard(`${scheme}://${fullDomain}`);
    toast.success("URL copied");
  };

  const tabs = [
    { key: "requests", label: "Requests", shortcut: "1" },
    { key: "response", label: "Response", shortcut: "2" },
    { key: "dns", label: "DNS", shortcut: "3" },
  ];

  return (
    <div className="lab-toolbar flex flex-wrap items-center justify-between gap-x-4 px-4 md:px-6">
      <nav className="flex items-center">
        {tabs.map((tab) => (
          <button
            type="button"
            aria-label={tab.label}
            key={tab.key}
            className="nav-tab"
            aria-current={currentPath === tab.key ? "page" : undefined}
            onClick={() => navigate(`/${tab.key}`)}
          >
            {tab.label}
            <span className="nav-key">{tab.shortcut}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 basis-full items-center justify-end gap-1 pb-2 xl:basis-auto xl:flex-1 xl:pb-0">
        <div className="url-group min-w-0 flex-1 xl:flex-none">
          <select
            aria-label="Callback URL scheme"
            value={scheme}
            onChange={(e) => setScheme(e.target.value as "http" | "https")}
          >
            <option value="https">https://</option>
            <option value="http">http://</option>
          </select>
          <input
            aria-label="Callback domain"
            value={fullDomain}
            readOnly
            disabled={!session}
            title="Click to copy the bare domain"
            style={{
              width: `${Math.min(Math.max(fullDomain.length, 18), 42) + 3}ch`,
            }}
            onClick={() => {
              copyToClipboard(fullDomain);
              toast.success("Domain copied");
            }}
          />
          <button
            type="button"
            className="copy"
            disabled={!session}
            aria-label="Copy callback URL"
            onClick={handleCopyUrl}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copy</span>
          </button>
        </div>
        <Tooltip content="Swap this session for a random or named subdomain">
          <button
            type="button"
            className="text-btn shrink-0"
            disabled={!session}
            aria-label="New callback URL"
            onClick={() => setDialogOpen(true)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">New URL</span>
          </button>
        </Tooltip>
      </div>
      <SessionDialog
        mode="replace"
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
