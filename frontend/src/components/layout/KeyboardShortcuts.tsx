import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tooltip,
} from "@heroui/react";
import { Keyboard } from "lucide-react";
import { toast } from "sonner";
import { shortcutAction } from "@/lib/qol";
import { visibleRequests } from "@/lib/lab";
import { copyToClipboard } from "@/lib/utils";
import { getBaseDomain } from "@/lib/config";
import { useUiStore } from "@/stores/uiStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useRequestStore } from "@/stores/requestStore";
import { useLabStore } from "@/stores/labStore";

const shortcuts = [
  ["/ or Ctrl/Cmd + K", "Focus request search"],
  ["J / K", "Next / previous visible request"],
  ["B", "Bookmark the selected request"],
  ["C", "Copy the active callback URL"],
  ["P", "Pause / follow the request queue"],
  ["1 / 2 / 3", "Requests / Response / DNS"],
  ["?", "Show this guide"],
  ["Ctrl/Cmd + S", "Save the response editor"],
];
export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = !!target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .monaco-editor',
      );
      const modal = !!document.querySelector(
        '[role="dialog"], [role="listbox"], [role="menu"]',
      );
      const action = shortcutAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editing,
        modal,
      });
      if (!action) return;
      const ui = useUiStore.getState();
      const lab = useLabStore.getState();
      const subdomain = useSessionStore.getState().activeSubdomain;
      if (action === "search") {
        event.preventDefault();
        const desktop = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search requests"]',
        );
        if (desktop && desktop.getClientRects().length) desktop.focus();
        else {
          document
            .querySelector<HTMLButtonElement>(
              'button[aria-label="Toggle search"]',
            )
            ?.click();
        }
      } else if (action === "help") {
        event.preventDefault();
        setOpen(true);
      } else if (["requests", "response", "dns"].includes(action)) {
        event.preventDefault();
        navigate(`/${action}`);
      } else if (action === "copy" && subdomain) {
        event.preventDefault();
        void copyToClipboard(
          `${lab.scheme}://${subdomain}.${getBaseDomain()}`,
        ).then(() => toast.success("Callback URL copied"));
      } else if (
        location.pathname === "/requests" &&
        subdomain &&
        !ui.sharedRequest
      ) {
        const rows = visibleRequests(
          useRequestStore.getState().requests[subdomain] ?? [],
          {
            http: ui.httpFilter,
            dns: ui.dnsFilter,
            smtp: ui.smtpFilter,
            search: ui.searchQuery,
            onlyBookmarks: lab.onlyBookmarks,
            bookmarks: lab.bookmarks[subdomain] ?? {},
          },
        );
        if (action === "next" || action === "previous") {
          const current = rows.findIndex(
            (row) => row._id === ui.selectedRequestId,
          );
          const index =
            current < 0
              ? action === "next"
                ? 0
                : rows.length - 1
              : Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    current + (action === "next" ? 1 : -1),
                  ),
                );
          if (rows[index]) {
            event.preventDefault();
            ui.selectRequest(rows[index]._id);
            ui.markRequestVisited(subdomain, rows[index]._id);
            document
              .querySelector<HTMLElement>(
                `.queue-item[data-request-id="${CSS.escape(rows[index]._id)}"]`,
              )
              ?.scrollIntoView({ block: "nearest" });
          }
        } else if (
          action === "bookmark" &&
          rows.some((row) => row._id === ui.selectedRequestId)
        ) {
          event.preventDefault();
          lab.toggleBookmark(subdomain, ui.selectedRequestId!);
        } else if (action === "follow") {
          event.preventDefault();
          lab.toggleFollow();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [location.pathname, navigate]);

  return (
    <>
      <Tooltip content="Keyboard shortcuts (?)">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Keyboard shortcuts"
          className="hidden md:flex"
          onPress={() => setOpen(true)}
        >
          <Keyboard size={16} />
        </Button>
      </Tooltip>
      <Modal isOpen={open} onOpenChange={setOpen} size="lg" backdrop="blur">
        <ModalContent>
          <ModalHeader>Keyboard shortcuts</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500">
              Single-key shortcuts work when you’re not typing or using a
              dialog. Queue actions use the current filters.
            </p>
            <dl className="shortcut-list">
              {shortcuts.map(([keys, label]) => (
                <div key={keys}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
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
