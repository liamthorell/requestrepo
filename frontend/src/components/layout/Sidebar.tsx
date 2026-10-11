import { useMemo, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button, Checkbox, ScrollShadow } from "@heroui/react";
import {
  X,
  CheckCheck,
  Bookmark,
  Pause,
  Play,
  Download,
  Inbox,
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
import { matchesRequest, downloadEvidence } from "@/lib/lab";
import { cn, formatRelativeTime, getFlagClass } from "@/lib/utils";
import type { Request } from "@/types";
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

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => {
        // Type filter
        if (r.type === "http" && !httpFilter) return false;
        if (r.type === "dns" && !dnsFilter) return false;
        if (r.type === "smtp" && !smtpFilter) return false;

        if (onlyBookmarks && !bookmarks[activeSubdomain ?? ""]?.[r._id])
          return false;
        return matchesRequest(r, searchQuery);
      })
      .sort((a, b) => a.date - b.date); // oldest first, newest at bottom
  }, [
    requests,
    httpFilter,
    dnsFilter,
    smtpFilter,
    searchQuery,
    onlyBookmarks,
    bookmarks,
    activeSubdomain,
  ]);

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

  return (
    <div className="flex h-full flex-col">
      {/* Mobile header with close button */}
      {onClose && (
        <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-default-200 px-3">
          <span className="text-sm font-semibold">Requests</span>
          <Button
            isIconOnly
            variant="light"
            size="sm"
            radius="full"
            onPress={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="queue-heading">
        <span className="eyebrow">THE GRILL QUEUE</span>
        <div className="flex items-center justify-between">
          <h2>Incoming signals</h2>
          <span className="queue-count">{requests.length}</span>
        </div>
      </div>
      {/* Requests header + filters */}
      <div className="mb-3 px-3">
        <p className="mb-2 text-sm font-medium text-default-500">
          {filteredRequests.length} shown ·{" "}
          {
            requests.filter(
              (r) => !visitedRequests[activeSubdomain ?? ""]?.[r._id],
            ).length
          }{" "}
          unread
        </p>
        <div className="flex items-center gap-3">
          <Checkbox
            isSelected={httpFilter}
            onValueChange={(checked) =>
              setFilters(checked, dnsFilter, smtpFilter)
            }
            size="sm"
            radius="full"
          >
            <span className="text-sm">HTTP</span>
          </Checkbox>
          <Checkbox
            isSelected={dnsFilter}
            onValueChange={(checked) =>
              setFilters(httpFilter, checked, smtpFilter)
            }
            size="sm"
            radius="full"
          >
            <span className="text-sm">DNS</span>
          </Checkbox>
          <Checkbox
            isSelected={smtpFilter}
            onValueChange={(checked) =>
              setFilters(httpFilter, dnsFilter, checked)
            }
            size="sm"
            radius="full"
          >
            <span className="text-sm">SMTP</span>
          </Checkbox>
        </div>
      </div>

      <div className="flex gap-2 px-3 pb-3">
        <Button
          size="sm"
          className="flex-1"
          variant="flat"
          color={onlyBookmarks ? "primary" : "default"}
          aria-pressed={onlyBookmarks}
          startContent={<Bookmark size={13} />}
          onPress={toggleOnlyBookmarks}
        >
          {onlyBookmarks ? "Bookmarked" : "Bookmarks"}
        </Button>
        <Button
          size="sm"
          variant="flat"
          aria-pressed={!followRequests}
          aria-label={
            followRequests ? "Pause auto-scroll" : "Resume auto-scroll"
          }
          startContent={
            followRequests ? <Pause size={13} /> : <Play size={13} />
          }
          onPress={toggleFollow}
        >
          {followRequests ? "Pause" : "Follow"}
        </Button>
      </div>
      {/* Request list */}
      <ScrollShadow
        ref={scrollContainerRef}
        className="flex-1 overflow-auto px-2"
      >
        <div className="flex flex-col gap-1">
          {filteredRequests.length === 0 && (
            <div className="queue-empty">
              <Inbox size={25} />
              <strong>
                {requests.length
                  ? "No matching signals"
                  : "Nothing on the grill yet"}
              </strong>
              <span>
                {requests.length
                  ? "Try changing your filters or search."
                  : "Send a callback to your session URL."}
              </span>
            </div>
          )}
          {filteredRequests.map((request, index) => {
            const isActive = request._id === selectedRequestId;
            const isVisited = activeSubdomain
              ? (visitedRequests[activeSubdomain]?.[request._id] ?? false)
              : false;
            const isHttp = isHttpRequest(request);
            const isSmtp = isSmtpRequest(request);
            const isFirst = index === 0;
            const isLast = index === filteredRequests.length - 1;

            // Determine badge color
            const getBadgeColor = () => {
              if (isSmtp) return "bg-[#b33b72]"; // Pink for SMTP
              if (!isHttp) return "bg-[#087f9c]"; // Cyan for DNS
              // HTTP methods
              switch (request.method) {
                case "GET":
                  return "bg-[#24764e]";
                case "POST":
                  return "bg-[#a36010]";
                case "PUT":
                  return "bg-[#ab5e27]";
                case "DELETE":
                  return "bg-[#f44336]";
                default:
                  return "bg-[#9e9e9e]";
              }
            };

            // Determine badge text
            const getBadgeText = () => {
              if (isHttp) return request.method;
              if (isSmtp) return "SMTP";
              return "DNS";
            };

            // Determine display text
            const getDisplayText = () => {
              if (isHttp) {
                return `${request.path}${request.query ?? ""}${request.fragment ? `#${request.fragment}` : ""}`;
              }
              if (isSmtp) {
                // Use structured data from backend
                const subject = request.subject;
                const from = request.from;
                if (subject) {
                  if (from) {
                    // Extract just the name/email without angle brackets
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

            return (
              <div
                key={request._id}
                ref={(el) => {
                  if (el) requestRefs.current.set(request._id, el);
                  else requestRefs.current.delete(request._id);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Select ${getBadgeText()} request ${getDisplayText()}`}
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
                className={cn(
                  "queue-item group cursor-pointer px-3 py-3 transition-colors hover:bg-default-200 dark:hover:bg-default-100",
                  isFirst && "rounded-t-md",
                  isLast && "rounded-b-md",
                  isActive && "bg-primary/10",
                  isVisited && !isActive && "bg-default-100 dark:bg-black/20",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {bookmarks[activeSubdomain ?? ""]?.[request._id] && (
                    <Bookmark
                      size={12}
                      className="shrink-0 text-primary"
                      fill="currentColor"
                    />
                  )}
                  {!isVisited && (
                    <span className="shrink-0 inline-block px-1 py-px text-[10px] font-semibold text-white bg-red-500 rounded">
                      NEW
                    </span>
                  )}
                  <span
                    className={`shrink-0 inline-block px-1 py-px text-[10px] font-semibold text-white rounded ${getBadgeColor()}`}
                  >
                    {getBadgeText()}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm",
                      !isVisited && "font-medium",
                    )}
                  >
                    {getDisplayText()}
                  </span>
                  <button
                    aria-label="Delete request"
                    className="ml-auto shrink-0 rounded p-1 text-default-400 hover:text-danger focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    onClick={(e) => handleDeleteRequest(e, request._id)}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-xs text-default-400">
                  <span className={getFlagClass(request.country)} />
                  <span className="truncate">{request.ip}</span>
                  <span className="ml-auto shrink-0">
                    {formatRelativeTime(request.date)}
                  </span>
                </div>
              </div>
            );
          })}
          {/* Scroll anchor for auto-scroll to bottom */}
          <div ref={bottomRef} />
        </div>
      </ScrollShadow>

      {/* Mark all as read */}
      <div className="queue-footer shrink-0 space-y-2 p-3">
        <Button
          color="default"
          variant="flat"
          size="sm"
          className="w-full"
          startContent={<CheckCheck className="h-4 w-4" />}
          onPress={handleMarkAllRead}
          isDisabled={requests.length === 0 || allRead}
          radius="lg"
        >
          Mark all as read
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            variant="bordered"
            startContent={<Download size={13} />}
            isDisabled={!activeSubdomain || filteredRequests.length === 0}
            onPress={() => {
              if (activeSubdomain)
                downloadEvidence(
                  activeSubdomain,
                  filteredRequests,
                  bookmarks[activeSubdomain] ?? {},
                  notes[activeSubdomain] ?? {},
                );
            }}
          >
            Export shown
          </Button>
          <Button
            size="sm"
            isIconOnly
            aria-label="Delete all requests"
            title="Delete all requests"
            variant="light"
            color="danger"
            isDisabled={requests.length === 0}
            onPress={handleDeleteAll}
          >
            <X size={16} />
          </Button>
        </div>
        <p className="text-center text-[10px] text-default-500">
          Bookmarks & notes saved in this browser
        </p>
      </div>
    </div>
  );
}
