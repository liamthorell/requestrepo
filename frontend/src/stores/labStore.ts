import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LabState {
  sessionLabels: Record<string, string>;
  setSessionLabel: (subdomain: string, label: string) => void;
  moveSessionLabel: (oldSubdomain: string, newSubdomain: string) => void;
  bookmarks: Record<string, Record<string, boolean>>;
  notes: Record<string, Record<string, string>>;
  onlyBookmarks: boolean;
  followRequests: boolean;
  scheme: "http" | "https";
  toggleBookmark: (subdomain: string, id: string) => void;
  setNote: (subdomain: string, id: string, note: string) => void;
  toggleOnlyBookmarks: () => void;
  toggleFollow: () => void;
  setScheme: (scheme: "http" | "https") => void;
}

export const useLabStore = create<LabState>()(
  persist(
    (set) => ({
      sessionLabels: {},
      setSessionLabel: (subdomain, label) =>
        set((state) => {
          const sessionLabels = { ...state.sessionLabels };
          const cleaned = label.trim().replace(/\s+/g, " ").slice(0, 48);
          if (cleaned) sessionLabels[subdomain] = cleaned;
          else delete sessionLabels[subdomain];
          return { sessionLabels };
        }),
      moveSessionLabel: (oldSubdomain, newSubdomain) =>
        set((state) => {
          const sessionLabels = { ...state.sessionLabels };
          if (sessionLabels[oldSubdomain])
            sessionLabels[newSubdomain] = sessionLabels[oldSubdomain];
          delete sessionLabels[oldSubdomain];
          return { sessionLabels };
        }),
      bookmarks: {},
      notes: {},
      onlyBookmarks: false,
      followRequests: true,
      scheme: "https",
      toggleBookmark: (subdomain, id) =>
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [subdomain]: {
              ...state.bookmarks[subdomain],
              [id]: !state.bookmarks[subdomain]?.[id],
            },
          },
        })),
      setNote: (subdomain, id, note) =>
        set((state) => ({
          notes: {
            ...state.notes,
            [subdomain]: {
              ...state.notes[subdomain],
              [id]: note.slice(0, 4000),
            },
          },
        })),
      toggleOnlyBookmarks: () =>
        set((state) => ({ onlyBookmarks: !state.onlyBookmarks })),
      toggleFollow: () =>
        set((state) => ({ followRequests: !state.followRequests })),
      setScheme: (scheme) => set({ scheme }),
    }),
    {
      name: "kebab-requestlab",
      partialize: ({
        bookmarks,
        notes,
        scheme,
        followRequests,
        sessionLabels,
      }) => ({
        sessionLabels,
        bookmarks,
        notes,
        scheme,
        followRequests,
      }),
    },
  ),
);

// Rehydrate without writing back, keeping open tabs from overwriting a stale notebook.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "kebab-requestlab" && event.newValue) {
      void useLabStore.persist.rehydrate();
    }
  });
}
