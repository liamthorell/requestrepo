import { useMemo, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Tooltip } from "@heroui/react";
import {
  X,
  CheckCheck,
  Bookmark,
  Pause,
  Play,
  Download,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import {
  useRequestStore,
  broadcastDeleteRequest,
  broadcastClearRequests,
} from "@/stores/requestStore";
import { useUiStore } from "@/stores/uiStore";
import { apiClient } from "@/api/client";
import { useLabStore } from "@/stores/labStore";
import { visibleRequests, downloadEvidence } from "@/lib/lab";
import { cn, formatRelativeTime, getFlagClass } from "@/lib/utils";
import type { Request } from "@/types";
import { KebabMark } from "./KebabMark";
import { isHttpRequest, isSmtpRequest } from "@/types";

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const sessions = useSessionStore((s) => s.sessions);
  const activeSubdomain = useSessionStore((s) => s.activeSubdomain);
  const session = sessions.find((s) => s.subdomain === activeSubdomain);

  const allRequests = useRequestStore((s) => s.requests);
  const requests = useMemo(
    () => (activeSubdomain ? (allRequests[activeSubdomain] ?? []) : []),
    [activeSubdomain, allRequests],
  );
  const clearRequests = useRequestStore((s) => s.clearRequests);

  const httpFilter = useUiStore((s) => s.httpFilter);
  const dnsFilter = useUiStore((s) => s.dnsFilter);
  const smtpFilter = useUiStore((s) => s.smtpFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setFilters = useUiStore((s) => s.setFilters);
  const selectedRequestId = useUiStore((s) => s.selectedRequestId);
  const selectRequest = useUiStore((s) => s.selectRequest);
  const visitedRequests = useUiStore((s) => s.visitedRequests);
  const markRequestVisited = useUiStore((s) => s.markRequestVisited);
  const markAllAsRead = useUiStore((s) => s.markAllAsRead);

  const bookmarks = useLabStore((s) => s.bookmarks);
  const notes = useLabStore((s) => s.notes);
  const onlyBookmarks = useLabStore((s) => s.onlyBookmarks);
  const toggleOnlyBookmarks = useLabStore((s) => s.toggleOnlyBookmarks);
  const followRequests = useLabStore((s) => s.followRequests);
  const toggleFollow = useLabStore((s) => s.toggleFollow);

  const removeRequest = useRequestStore((s) => s.removeRequest);

  // Refs for scroll behavior
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const requestRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRequestCountRef = useRef<number>(0);
  const initialScrollDoneRef = useRef<boolean>(false);

  const filteredRequests = useMemo(
    () =>
      visibleRequests(requests, {
        http: httpFilter,
        dns: dnsFilter,
        smtp: smtpFilter,
        search: searchQuery,
        onlyBookmarks,
        bookmarks: bookmarks[activeSubdomain ?? ""] ?? {},
      }),
    [
      requests,
      httpFilter,
      dnsFilter,
      smtpFilter,
      searchQuery,
      onlyBookmarks,
      bookmarks,
      activeSubdomain,
    ],
  );

  // Scroll to bottom helper
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  };

  // Scroll to specific request (centered)
  const scrollToRequest = (requestId: string) => {
    const element = requestRefs.current.get(requestId);
    if (element) {
      element.scrollIntoView({ behavior: "auto", block: "center" });
    }
  };

  // Initial scroll on mount - scroll to selected request or bottom
  useEffect(() => {
    if (initialScrollDoneRef.current || filteredRequests.length === 0) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (selectedRequestId && requestRefs.current.has(selectedRequestId)) {
        scrollToRequest(selectedRequestId);
      } else {
        scrollToBottom();
      }
      initialScrollDoneRef.current = true;
      prevRequestCountRef.current = filteredRequests.length;
    }, 100);

    return () => clearTimeout(timer);
  }, [filteredRequests.length, selectedRequestId]);

  // Scroll to bottom when new requests arrive
  useEffect(() => {
    if (!initialScrollDoneRef.current) return;

    if (
      followRequests &&
      filteredRequests.length > prevRequestCountRef.current
    ) {
      scrollToBottom();
    }
    prevRequestCountRef.current = filteredRequests.length;
  }, [filteredRequests.length, followRequests]);

  // Reset initial scroll flag when subdomain changes
  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevRequestCountRef.current = 0;
  }, [activeSubdomain]);

  const handleDeleteRequest = async (
    e: React.MouseEvent,
    requestId: string,
  ) => {
    e.stopPropagation();
    if (!session) return;
    try {
      await apiClient.deleteRequest(session.token, requestId);
      removeRequest(activeSubdomain!, requestId);
      broadcastDeleteRequest(activeSubdomain!, requestId); // Notify other tabs
      if (selectedRequestId === requestId) {
        selectRequest(null);
      }
    } catch (error) {
      console.error("Delete request failed:", error);
      toast.error("Failed to delete request");
    }
  };

  // Check if all are read
  const allRead = useMemo(() => {
    if (!activeSubdomain || requests.length === 0) return true;
    return requests.every((r) => visitedRequests[activeSubdomain]?.[r._id]);
  }, [activeSubdomain, requests, visitedRequests]);

  const handleDeleteAll = async () => {
    if (
      !session ||
      !window.confirm(
        "Delete all captured requests in this session? Export any evidence you want to keep first.",
      )
    )
      return;
    try {
      await apiClient.deleteAllRequests(session.token);
      clearRequests(activeSubdomain!);
      broadcastClearRequests(activeSubdomain!); // Notify other tabs
      selectRequest(null);
      toast.success("All requests deleted");
    } catch (error) {
      console.error("Delete all requests failed:", error);
      toast.error("Failed to delete requests");
    }
  };

  const handleMarkAllRead = () => {
    if (!activeSubdomain || allRead) return;
    markAllAsRead(
      activeSubdomain,
      requests.map((r) => r._id),
    );
  };

  const handleSelectRequest = (request: Request) => {
    selectRequest(request._id);
    if (activeSubdomain) {
      markRequestVisited(activeSubdomain, request._id);
    }
    onClose?.();
    // Navigate to requests page if not already there
    if (location.pathname !== "/requests") {
      navigate("/requests");
    }
  };

  // Tickets are numbered by arrival across the whole session, so a number
  // stays put when filters hide its neighbours.
  const ticketNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    [...requests]
      .sort((a, b) => a.date - b.date)
      .forEach((r, i) => numbers.set(r._id, i + 1));
    return numbers;
  }, [requests]);
  const typeCounts = useMemo(() => {
    const counts = { http: 0, dns: 0, smtp: 0 };
    for (const r of requests) counts[r.type] += 1;
    return counts;
  }, [requests]);
  const unreadCount = requests.filter(
    (r) => !visitedRequests[activeSubdomain ?? ""]?.[r._id],
  ).length;
  const typeFilters = [
    { key: "http", label: "HTTP", on: httpFilter },
    { key: "dns", label: "DNS", on: dnsFilter },
    { key: "smtp", label: "SMTP", on: smtpFilter },
  ] as const;
  const toggleType = (key: "http" | "dns" | "smtp") =>
    setFilters(
      key === "http" ? !httpFilter : httpFilter,
      key === "dns" ? !dnsFilter : dnsFilter,
      key === "smtp" ? !smtpFilter : smtpFilter,
    );

  return (
    <div className="flex h-full flex-col">
      <div className="queue-head">
        <h2>Requests</h2>
        <div className="flex items-center gap-1">
          <span className="queue-stats">
            {filteredRequests.length !== requests.length &&
              `${filteredRequests.length}/`}
            {requests.length}
            {unreadCount > 0 && (
              <span className="text-[var(--lab-accent-ink)]">
                {" "}
                · {unreadCount} new
              </span>
            )}
          </span>
          {onClose && (
            <button
              type="button"
              className="icon-btn -mr-2 ml-1"
              aria-label="Close request queue"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="queue-filters">
        {typeFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            className="type-toggle"
            aria-pressed={f.on}
            title={`${f.on ? "Hide" : "Show"} ${f.label}`}
            onClick={() => toggleType(f.key)}
          >
            {f.label}
            <span className="n">{typeCounts[f.key]}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Tooltip
          content={onlyBookmarks ? "Show everything" : "Only bookmarked"}
        >
          <button
            type="button"
            className="icon-btn"
            aria-label={onlyBookmarks ? "Bookmarked" : "Bookmarks"}
            aria-pressed={onlyBookmarks}
            style={onlyBookmarks ? { color: "var(--lab-accent-ink)" } : {}}
            onClick={toggleOnlyBookmarks}
          >
            <Bookmark
              size={15}
              fill={onlyBookmarks ? "currentColor" : "none"}
            />
          </button>
        </Tooltip>
        <Tooltip
          content={
            followRequests
              ? "Stop jumping to new requests (P)"
              : "Jump to new requests (P)"
          }
        >
          <button
            type="button"
            className="icon-btn"
            aria-pressed={!followRequests}
            aria-label={
              followRequests ? "Pause auto-scroll" : "Resume auto-scroll"
            }
            style={!followRequests ? { color: "var(--lab-accent-ink)" } : {}}
            onClick={toggleFollow}
          >
            {followRequests ? <Pause size={15} /> : <Play size={15} />}
          </button>
        </Tooltip>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {filteredRequests.length === 0 && (
          <div className="queue-empty">
            <KebabMark />
            <strong>
              {requests.length ? "Nothing matches" : "Nothing yet"}
            </strong>
            <span>
              {requests.length
                ? "Loosen the filters or clear the search."
                : "Send something to the URL above."}
            </span>
          </div>
        )}
        {filteredRequests.map((request) => {
          const isActive = request._id === selectedRequestId;
          const isVisited = activeSubdomain
            ? (visitedRequests[activeSubdomain]?.[request._id] ?? false)
            : false;
          const isHttp = isHttpRequest(request);
          const isSmtp = isSmtpRequest(request);
          const badge = isHttp ? request.method : isSmtp ? "SMTP" : "DNS";
          const methodClass = `m-${badge.toLowerCase()}`;

          const getDisplayText = () => {
            if (isHttp) {
              return `${request.path}${request.query ?? ""}${request.fragment ? `#${request.fragment}` : ""}`;
            }
            if (isSmtp) {
              const subject = request.subject;
              const from = request.from;
              if (subject) {
                if (from) {
                  const fromDisplay = from
                    .replace(/<[^>]+>/g, "")
                    .trim()
                    .replace(/^"([^"]+)"$/, "$1");
                  return `${subject} - ${fromDisplay}`;
                }
                return subject;
              }
              return "Email";
            }
            return request.domain;
          };
          const ticket = ticketNumbers.get(request._id) ?? 0;

          return (
            <div
              key={request._id}
              data-request-id={request._id}
              ref={(el) => {
                if (el) requestRefs.current.set(request._id, el);
                else requestRefs.current.delete(request._id);
              }}
              role="button"
              tabIndex={0}
              aria-label={`Select ${badge} request ${getDisplayText()}`}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  handleSelectRequest(request);
                }
              }}
              onClick={() => handleSelectRequest(request)}
              className={cn("queue-item group", !isVisited && "is-unread")}
            >
              <div className="qi-row">
                <span
                  className="qi-num"
                  title={isVisited ? undefined : "Not opened yet"}
                >
                  {String(ticket).padStart(3, "0")}
                </span>
                <span className={cn("method", methodClass)}>{badge}</span>
                <span className="qi-path">{getDisplayText()}</span>
                {bookmarks[activeSubdomain ?? ""]?.[request._id] && (
                  <Bookmark
                    size={12}
                    className="shrink-0 text-[var(--lab-accent-ink)]"
                    fill="currentColor"
                  />
                )}
                <button
                  aria-label="Delete request"
                  className="-my-1 ml-auto shrink-0 rounded p-1 text-[var(--lab-faint)] hover:text-[var(--lab-accent-ink)] focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  onClick={(e) => handleDeleteRequest(e, request._id)}
                >
                  <X size={12} />
                </button>
              </div>
              <div className="qi-meta">
                <span className={getFlagClass(request.country)} />
                <span className="truncate font-mono">{request.ip}</span>
                <span className="ml-auto shrink-0">
                  {formatRelativeTime(request.date)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="queue-footer shrink-0">
        <div className="flex items-center">
          <button
            type="button"
            className="text-btn"
            onClick={handleMarkAllRead}
            disabled={requests.length === 0 || allRead}
          >
            <CheckCheck size={14} />
            Mark read
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={!activeSubdomain || filteredRequests.length === 0}
            title="Download the requests currently listed, with notes, as JSON"
            onClick={() => {
              if (activeSubdomain)
                downloadEvidence(
                  activeSubdomain,
                  filteredRequests,
                  bookmarks[activeSubdomain] ?? {},
                  notes[activeSubdomain] ?? {},
                );
            }}
          >
            <Download size={14} />
            Export
          </button>
          <button
            type="button"
            className="text-btn ml-auto hover:!text-[var(--m-delete)]"
            aria-label="Delete all requests"
            title="Delete all requests"
            disabled={requests.length === 0}
            onClick={handleDeleteAll}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <p>Bookmarks and notes stay in this browser.</p>
      </div>
    </div>
  );
}
