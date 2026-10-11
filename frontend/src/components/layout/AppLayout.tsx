import { Outlet, useLocation } from "react-router-dom";
import { Topbar } from "./Topbar";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { RequestTools } from "./RequestTools";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAutoSession } from "@/hooks/useAutoSession";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/uiStore";

export function AppLayout() {
  // Auto-create session if none exists
  useAutoSession();

  // Initialize WebSocket connection
  useWebSocket();

  // Update document title with unseen request count
  useDocumentTitle();

  const location = useLocation();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const handleCloseSidebar = () => setSidebarOpen(false);

  return (
    <div className="lab-shell h-dvh w-full overflow-hidden">
      <header className="fixed left-0 right-0 top-0 z-50 h-12">
        <Topbar />
      </header>

      {/* Desktop Sidebar - hidden on mobile */}
      <aside className="fixed bottom-0 left-0 top-12 z-40 hidden lab-sidebar w-[320px] lg:block">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={handleCloseSidebar}
          />
          {/* Sidebar */}
          <aside className="fixed bottom-0 left-0 top-0 z-50 lab-sidebar w-[min(320px,88vw)] lg:hidden">
            <Sidebar onClose={handleCloseSidebar} />
          </aside>
        </>
      )}

      {/* Main Content - offset by topbar and sidebar (sidebar margin only on lg+) */}
      <main className="mt-12 flex h-[calc(100dvh-48px)] flex-col overflow-hidden lg:ml-[320px]">
        {/* Toolbar row */}
        <div className="shrink-0">
          <Toolbar />
        </div>

        {/* Content area */}
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-5">
          {location.pathname.startsWith("/requests") && <RequestTools />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
