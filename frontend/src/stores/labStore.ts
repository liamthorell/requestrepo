import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LabState {
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
      partialize: ({ bookmarks, notes, scheme, followRequests }) => ({
        bookmarks,
        notes,
        scheme,
        followRequests,
      }),
    },
  ),
);
