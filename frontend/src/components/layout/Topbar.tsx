import { useState } from "react";
import { Tooltip } from "@heroui/react";
import { Plus, Share2, Search, X, Menu } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "./ThemeToggle";
import { useSessionStore } from "@/stores/sessionStore";
import { useRequestStore } from "@/stores/requestStore";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { apiClient, isAdminRequiredError } from "@/api/client";
import { copyToClipboard } from "@/lib/utils";
import { KebabMark } from "./KebabMark";
import { SessionNaming } from "./SessionNaming";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { useLabStore } from "@/stores/labStore";
import { getBaseDomain } from "@/lib/config";

const MAX_SESSIONS = 5;

export function Topbar() {
  const sessionLabels = useLabStore((s) => s.sessionLabels);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSubdomain = useSessionStore((s) => s.activeSubdomain);
  const addSession = useSessionStore((s) => s.addSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const removeSession = useSessionStore((s) => s.removeSession);

  const activeSession = sessions.find((s) => s.subdomain === activeSubdomain);

  const allRequests = useRequestStore((s) => s.requests);

  const visitedRequests = useUiStore((s) => s.visitedRequests);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // Mobile search toggle
  const [searchVisible, setSearchVisible] = useState(false);

  // Get unread count for a specific subdomain
  const getUnreadCount = (subdomain: string) => {
    const requests = allRequests[subdomain] ?? [];
    return requests.filter((r) => !visitedRequests[subdomain]?.[r._id]).length;
  };

  const setShowAuthOverlay = useAuthStore((s) => s.setShowAuthOverlay);

  const handleCreateSession = async () => {
    if (sessions.length >= MAX_SESSIONS) {
      toast.error(`Maximum ${MAX_SESSIONS} sessions allowed`);
      return;
    }
    try {
      const response = await apiClient.createSession();
      addSession({
        subdomain: response.subdomain,
        token: response.token,
        createdAt: new Date().toISOString(),
      });
      toast.success(`Session created: ${response.subdomain}`);
    } catch (error) {
      if (isAdminRequiredError(error)) {
        // Show auth overlay - user needs to enter admin password
        setShowAuthOverlay(true);
      } else {
        toast.error("Failed to create session");
      }
    }
  };

  const handleShare = () => {
    if (activeSession) {
      const url = `${window.location.origin}/?share=${activeSession.token}`;
      copyToClipboard(url);
      toast.success("Session share link copied to clipboard");
    } else {
      toast.error("No active session to share");
    }
  };

  const handleCloseSession = (e: React.MouseEvent, subdomain: string) => {
    e.stopPropagation();
    if (sessions.length === 1) {
      toast.error("Cannot close the last session");
      return;
    }
    removeSession(subdomain);
    toast.success(`Session ${subdomain} closed`);
  };

  const searchField = (mobile: boolean) => (
    <label
      className={mobile ? "search-box w-full" : "search-box hidden md:flex"}
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <input
        aria-label={mobile ? "Search requests on mobile" : "Search requests"}
        placeholder="Search headers, bodies, IPs"
        value={searchQuery}
        autoFocus={mobile}
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setSearchQuery("");
            if (mobile) setSearchVisible(false);
            event.currentTarget.blur();
          }
        }}
      />
      {!mobile && !searchQuery && <kbd className="key">/</kbd>}
      {searchQuery && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setSearchQuery("")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );

  return (
    <div className="lab-topbar relative flex h-12 items-center justify-between gap-3 pl-2 pr-3 md:pl-4">
      <div className="flex min-w-0 flex-1 items-center gap-1 md:gap-3">
        <button
          type="button"
          aria-label="Open request queue"
          onClick={toggleSidebar}
          className="icon-btn shrink-0 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <a
          href="/"
          className="wordmark shrink-0 pr-1 md:pr-3"
          aria-label="KebabEngineers requests home"
        >
          <KebabMark className="h-7 w-7" />
          <span className="hidden sm:flex sm:items-baseline">
            <b>KebabEngineers</b>
            <i>/req</i>
          </span>
        </a>

        {sessions.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center overflow-x-auto md:border-l md:border-[var(--lab-line)] md:pl-2">
            {sessions.map((session) => {
              const unreadCount = getUnreadCount(session.subdomain);
              const name =
                sessionLabels[session.subdomain] || session.subdomain;
              const active = session.subdomain === activeSubdomain;
              return (
                <div
                  key={session.subdomain}
                  className="session-tab group shrink-0"
                  data-active={active}
                >
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2"
                    aria-label={`Switch to session ${name}`}
                    aria-current={active ? "true" : undefined}
                    title={`${session.subdomain}.${getBaseDomain()}`}
                    onClick={() => setActiveSession(session.subdomain)}
                  >
                    <span className="max-w-40 truncate">{name}</span>
                    {unreadCount > 0 && (
                      <span className="tab-unread">{unreadCount}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close session ${name}`}
                    className="tab-close opacity-70 group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0"
                    onClick={(e) => handleCloseSession(e, session.subdomain)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            <Tooltip content="New session">
              <button
                type="button"
                className="icon-btn ml-1 shrink-0"
                aria-label="New session"
                onClick={handleCreateSession}
              >
                <Plus className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <SessionNaming />
        <Tooltip content="Copy share link">
          <button
            type="button"
            className="icon-btn hidden md:inline-grid"
            aria-label="Share session"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4" />
          </button>
        </Tooltip>
        <KeyboardShortcuts />
        <ThemeToggle />
        <button
          type="button"
          aria-label="Toggle search"
          onClick={() => setSearchVisible(!searchVisible)}
          className="icon-btn md:hidden"
        >
          <Search className="h-4 w-4" />
        </button>
        <div className="ml-2">{searchField(false)}</div>
      </div>

      {searchVisible && (
        <div className="absolute left-0 right-0 top-12 z-50 border-b border-[var(--lab-line)] bg-[var(--lab-bg)] p-2 md:hidden">
          {searchField(true)}
        </div>
      )}
    </div>
  );
}
