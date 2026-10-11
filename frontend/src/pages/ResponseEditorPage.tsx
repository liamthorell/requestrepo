import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Button,
  Input,
  Autocomplete,
  AutocompleteItem,
  Card,
  CardBody,
  Select,
  SelectItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import {
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FilePlus,
} from "lucide-react";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { useSessionStore } from "@/stores/sessionStore";
import { useTheme } from "@/hooks/useTheme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { encodeBase64, decodeBase64 } from "@/lib/base64";
import { ResponsePresets } from "@/components/layout/ResponsePresets";
import { FileTree } from "@/components/file-tree";
import type { FileTree as FileTreeType, ResponseHeader } from "@/types";

// Common HTTP headers for autocomplete
const HTTP_HEADERS = [
  "Accept",
  "Accept-CH",
  "Accept-Charset",
  "Accept-Encoding",
  "Accept-Language",
  "Accept-Patch",
  "Accept-Ranges",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Origin",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
  "Access-Control-Request-Headers",
  "Access-Control-Request-Method",
  "Age",
  "Allow",
  "Alt-Svc",
  "Authorization",
  "Cache-Control",
  "Clear-Site-Data",
  "Connection",
  "Content-Disposition",
  "Content-Encoding",
  "Content-Language",
  "Content-Length",
  "Content-Location",
  "Content-Range",
  "Content-Security-Policy",
  "Content-Type",
  "Cookie",
  "Cross-Origin-Embedder-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
  "Date",
  "ETag",
  "Expect",
  "Expires",
  "Forwarded",
  "From",
  "Host",
  "If-Match",
  "If-Modified-Since",
  "If-None-Match",
  "If-Range",
  "If-Unmodified-Since",
  "Keep-Alive",
  "Last-Modified",
  "Link",
  "Location",
  "Max-Forwards",
  "Origin",
  "Pragma",
  "Proxy-Authenticate",
  "Proxy-Authorization",
  "Range",
  "Referer",
  "Referrer-Policy",
  "Retry-After",
  "Server",
  "Set-Cookie",
  "Strict-Transport-Security",
  "TE",
  "Trailer",
  "Transfer-Encoding",
  "Upgrade",
  "User-Agent",
  "Vary",
  "Via",
  "WWW-Authenticate",
  "Warning",
  "X-Content-Type-Options",
  "X-DNS-Prefetch-Control",
  "X-Frame-Options",
  "X-Forwarded-For",
  "X-Forwarded-Host",
  "X-Forwarded-Proto",
  "X-Powered-By",
  "X-Requested-With",
  "X-XSS-Protection",
];

// Get Monaco language from filename
function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "json";
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "css":
      return "css";
    case "html":
    case "htm":
      return "html";
    case "md":
      return "markdown";
    case "xml":
      return "xml";
    default:
      return "html";
  }
}

export function ResponseEditorPage() {
  const { resolvedTheme } = useTheme();
  const sessions = useSessionStore((s) => s.sessions);
  const activeSubdomain = useSessionStore((s) => s.activeSubdomain);
  const session = sessions.find((s) => s.subdomain === activeSubdomain);
  const queryClient = useQueryClient();

  const [selectedFile, setSelectedFile] = useState<string>("index.html");
  const [content, setContent] = useState<string>("");
  const [statusCode, setStatusCode] = useState<string>("200");
  const [headers, setHeaders] = useState<ResponseHeader[]>([
    { header: "Content-Type", value: "text/html" },
  ]);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const handleSaveRef = useRef<() => void>(() => {});

  const { data: files = {}, isLoading: isLoadingFiles } = useQuery({
    queryKey: ["files", session?.token],
    queryFn: () => apiClient.getFiles(session!.token),
    enabled: Boolean(session?.token),
  });
  const serverFile = files[selectedFile];
  const savedBody = useMemo(
    () => decodeBase64(serverFile?.raw ?? ""),
    [serverFile?.raw],
  );

  // Track the last loaded file to avoid re-syncing unnecessarily
  const lastLoadedRef = useRef<{
    scope: string;
    raw: string;
    status: number;
    headers: string;
  } | null>(null);

  // Keep drafts scoped to their file and session, including header/status-only changes.
  useEffect(() => {
    if (isLoadingFiles) return;
    const fileData = files[selectedFile];
    const scope = `${session?.subdomain}:${selectedFile}`;
    const raw = fileData?.raw ?? "";
    const status = fileData?.status_code ?? 200;
    const serverHeaders = fileData?.headers ?? [
      { header: "Content-Type", value: "text/html" },
    ];
    const signature = JSON.stringify(serverHeaders);
    const previous = lastLoadedRef.current;
    if (
      !previous ||
      previous.scope !== scope ||
      previous.raw !== raw ||
      previous.status !== status ||
      previous.headers !== signature
    ) {
      lastLoadedRef.current = { scope, raw, status, headers: signature };
      queueMicrotask(() => {
        setContent(decodeBase64(raw));
        setStatusCode(String(status));
        setHeaders(serverHeaders);
      });
    }
  }, [files, selectedFile, session?.subdomain, isLoadingFiles]);

  const updateFilesMutation = useMutation({
    mutationFn: (newFiles: FileTreeType) =>
      apiClient.updateFiles(session!.token, newFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", session?.token] });
      toast.success("Saved");
    },
    onError: () => {
      toast.error("Failed to save");
    },
  });

  const handleSave = useCallback(() => {
    if (!session || isLoadingFiles || updateFilesMutation.isPending) return;
    const code = Number(statusCode);
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      toast.error("Status code must be between 100 and 599");
      return;
    }
    const newFiles: FileTreeType = {
      ...files,
      [selectedFile]: {
        raw: encodeBase64(content),
        status_code: code,
        headers,
      },
    };
    updateFilesMutation.mutate(newFiles);
  }, [
    files,
    selectedFile,
    content,
    statusCode,
    headers,
    updateFilesMutation,
    session,
    isLoadingFiles,
  ]);

  // Keep ref updated for keyboard shortcut
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Global Ctrl/Cmd+S handler (works everywhere on the page)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (document.querySelector('[role="dialog"]')) return;
        e.stopPropagation();
        handleSaveRef.current();
      }
    };

    // Use capture phase to intercept before browser handles it
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Handle file tree changes from FileTree component
  const handleFilesChange = useCallback(
    (newFiles: FileTreeType) => {
      updateFilesMutation.mutate(newFiles);
    },
    [updateFilesMutation],
  );

  const handleAddHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { header: "", value: "" }]);
  }, []);

  const handleRemoveHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleHeaderChange = useCallback(
    (index: number, field: "header" | "value", value: string) => {
      setHeaders((prev) =>
        prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
      );
    },
    [],
  );

  const handleOpenNewFileModal = useCallback(() => {
    setNewFileName("");
    setNewFileModalOpen(true);
  }, []);

  const handleCreateFile = useCallback(() => {
    const trimmed = newFileName.trim();
    if (!trimmed) {
      toast.error("Filename cannot be empty");
      return;
    }
    if (files[trimmed]) {
      toast.error("File already exists");
      return;
    }

    const newFiles: FileTreeType = {
      ...files,
      [trimmed]: {
        raw: encodeBase64(""),
        status_code: 200,
        headers: [{ header: "Content-Type", value: "text/html" }],
      },
    };
    updateFilesMutation.mutate(newFiles, {
      onSuccess: () => {
        setSelectedFile(trimmed);
        setNewFileModalOpen(false);
        setNewFileName("");
      },
    });
  }, [newFileName, files, updateFilesMutation]);

  if (!session) {
    return <div className="p-4 text-default-500">No session selected</div>;
  }

  const fileList = Object.keys(files);
  const dirty =
    content !== savedBody ||
    statusCode !== String(serverFile?.status_code ?? 200) ||
    JSON.stringify(headers) !==
      JSON.stringify(
        serverFile?.headers ?? [{ header: "Content-Type", value: "text/html" }],
      );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="response-draft-bar">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm">{selectedFile}</p>
        </div>
        <span className="draft-state" data-dirty={!serverFile || dirty}>
          {isLoadingFiles
            ? "Loading…"
            : !serverFile
              ? "New file draft"
              : dirty
                ? "Unsaved draft"
                : "Saved response"}
        </span>
        <ResponsePresets
          fileName={selectedFile}
          disabled={isLoadingFiles || updateFilesMutation.isPending}
          onApply={(draft) => {
            setContent(draft.body);
            setStatusCode(draft.statusCode);
            setHeaders(draft.headers);
            toast.info("Preset applied to draft. Save to publish.");
          }}
        />
      </div>
      <Card className="min-h-0 flex-1 border border-[var(--lab-line)]">
        <CardBody className="flex h-full flex-col overflow-hidden p-0 md:flex-row">
          {/* Main Content: Editor + Settings */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Mobile: Top bar with file selector and save */}
            <div className="flex shrink-0 items-center gap-2 border-b border-default-200 p-2 md:hidden">
              <FolderOpen className="h-4 w-4 shrink-0 text-default-400" />
              <Select
                size="sm"
                selectedKeys={[selectedFile]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  if (selected) setSelectedFile(selected);
                }}
                className="flex-1"
                classNames={{
                  trigger: "h-8 min-h-8",
                  value: "font-mono text-sm",
                }}
                aria-label="Select file"
              >
                {fileList.map((file) => (
                  <SelectItem key={file} textValue={file}>
                    <span className="font-mono text-sm">{file}</span>
                  </SelectItem>
                ))}
              </Select>
              <Button
                size="sm"
                isIconOnly
                variant="flat"
                onPress={handleOpenNewFileModal}
              >
                <FilePlus className="h-4 w-4" />
              </Button>
              <Button
                color="primary"
                size="sm"
                isIconOnly
                onPress={handleSave}
                isDisabled={isLoadingFiles}
                isLoading={updateFilesMutation.isPending}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>

            {/* Editor */}
            <div className="min-h-[200px] flex-[6] md:min-h-0">
              <Editor
                height="100%"
                language={getLanguage(selectedFile)}
                theme={resolvedTheme === "dark" ? "kebab-dark" : "kebab-light"}
                value={content}
                onChange={(value) => setContent(value ?? "")}
                loading={
                  <div className="p-4 text-default-500">Loading editor...</div>
                }
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  wordWrap: "on",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                }}
              />
            </div>

            {/* Response Settings */}
            <div className="flex-[4] overflow-auto border-t border-default-200 md:border-t-0">
              {/* Settings Header - collapsible on mobile */}
              <div
                className="flex cursor-pointer items-center justify-between p-3 md:cursor-default md:p-4"
                onClick={() => setSettingsExpanded(!settingsExpanded)}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Status and headers</h3>
                  <button className="text-default-400 md:hidden">
                    {settingsExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {/* Desktop save button */}
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Save className="h-4 w-4" />}
                  onPress={handleSave}
                  isDisabled={isLoadingFiles}
                  isLoading={updateFilesMutation.isPending}
                  className="hidden md:flex"
                >
                  Save
                </Button>
              </div>

              {/* Settings Content - collapsible on mobile */}
              <div
                className={`space-y-4 px-3 pb-3 md:px-4 md:pb-4 ${
                  settingsExpanded ? "block" : "hidden md:block"
                }`}
              >
                {/* Status Code */}
                <div className="flex items-center gap-3">
                  <label
                    className="w-16 shrink-0 text-sm text-default-500"
                    htmlFor="response-status"
                  >
                    Status
                  </label>
                  <Input
                    id="response-status"
                    aria-label="Response status code"
                    type="number"
                    size="sm"
                    variant="bordered"
                    value={statusCode}
                    onValueChange={setStatusCode}
                    min={100}
                    max={599}
                    className="w-28"
                    classNames={{
                      input: "font-mono",
                    }}
                  />
                </div>

                {/* Headers: name and value share the full width */}
                <div>
                  <div className="mb-2 grid grid-cols-[minmax(0,1fr)_2rem] gap-2 text-xs text-default-500 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem]">
                    <span>Header</span>
                    <span className="hidden md:block">Value</span>
                  </div>
                  <div className="space-y-2">
                    {headers.map((header, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 border-b border-[var(--lab-line)] pb-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem] md:border-0 md:pb-0"
                      >
                        <Autocomplete
                          size="sm"
                          variant="bordered"
                          aria-label="Header name"
                          placeholder="Header name"
                          defaultItems={HTTP_HEADERS.map((h) => ({
                            value: h,
                          }))}
                          inputValue={header.header}
                          onInputChange={(value) =>
                            handleHeaderChange(index, "header", value)
                          }
                          onSelectionChange={(key) => {
                            if (key)
                              handleHeaderChange(index, "header", String(key));
                          }}
                          className="col-span-2 w-full md:col-span-1"
                          classNames={{
                            base: "font-mono text-sm",
                          }}
                          allowsCustomValue
                        >
                          {(item) => (
                            <AutocompleteItem key={item.value}>
                              {item.value}
                            </AutocompleteItem>
                          )}
                        </Autocomplete>
                        <Input
                          size="sm"
                          variant="bordered"
                          aria-label={`Value for ${header.header || "header"}`}
                          placeholder="Value"
                          title={header.value}
                          value={header.value}
                          onValueChange={(v) =>
                            handleHeaderChange(index, "value", v)
                          }
                          className="w-full"
                          classNames={{
                            input: "font-mono text-sm",
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn hover:!text-[var(--m-delete)]"
                          aria-label={`Remove ${header.header || "header"}`}
                          onClick={() => handleRemoveHeader(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-btn mt-2 -ml-2"
                    onClick={handleAddHeader}
                  >
                    <Plus className="h-4 w-4" />
                    Add header
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: File Explorer - Desktop only */}
          <div className="hidden w-56 shrink-0 flex-col border-l border-[var(--lab-line)] bg-[var(--lab-bg)] md:flex">
            {/* Explorer Header */}
            <div className="flex items-center px-3 py-2 text-xs font-medium uppercase text-default-500">
              <span>Files</span>
              <span className="ml-1 normal-case text-default-400">
                · right-click for more
              </span>
            </div>

            {/* File Tree */}
            <FileTree
              files={files}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              onFilesChange={handleFilesChange}
              isLoading={isLoadingFiles}
            />
          </div>
        </CardBody>

        {/* New File Modal */}
        <Modal
          isOpen={newFileModalOpen}
          onOpenChange={setNewFileModalOpen}
          size="sm"
        >
          <ModalContent>
            {(onClose) => (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateFile();
                }}
              >
                <ModalHeader>Create New File</ModalHeader>
                <ModalBody>
                  <Input
                    label="Filename"
                    placeholder="e.g., page.html, api.json"
                    value={newFileName}
                    onValueChange={setNewFileName}
                    autoFocus
                    classNames={{
                      input: "font-mono",
                    }}
                  />
                </ModalBody>
                <ModalFooter>
                  <Button variant="flat" onPress={onClose}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    type="submit"
                    isDisabled={!newFileName.trim()}
                    isLoading={updateFilesMutation.isPending}
                    startContent={<FilePlus className="h-4 w-4" />}
                  >
                    Create
                  </Button>
                </ModalFooter>
              </form>
            )}
          </ModalContent>
        </Modal>
      </Card>
    </div>
  );
}
