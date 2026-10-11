import { describe, it } from "node:test";
import assert from "node:assert/strict";

const entries = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  },
  configurable: true,
});
Object.defineProperty(globalThis, "window", {
  value: { localStorage: globalThis.localStorage },
  configurable: true,
});
const { useLabStore } = await import("../src/stores/labStore");

describe("browser evidence notebook", () => {
  it("keeps the same request ID separate across sessions", () => {
    useLabStore.getState().toggleBookmark("session-a", "request-1");
    useLabStore.getState().setNote("session-a", "request-1", "SSRF proof");
    useLabStore.getState().setNote("session-b", "request-1", "Other challenge");
    assert.equal(
      useLabStore.getState().bookmarks["session-b"]?.["request-1"],
      undefined,
    );
    assert.equal(
      useLabStore.getState().notes["session-a"]["request-1"],
      "SSRF proof",
    );
    assert.equal(
      useLabStore.getState().notes["session-b"]["request-1"],
      "Other challenge",
    );
  });
  it("restores notes, bookmarks, scheme and follow preference from browser storage", async () => {
    useLabStore.getState().setScheme("http");
    useLabStore.getState().toggleFollow();
    useLabStore.setState({
      bookmarks: {},
      notes: {},
      scheme: "https",
      followRequests: true,
    });
    // A fresh page reads the previously saved notebook.
    const saved = {
      state: {
        bookmarks: { a: { proof: true } },
        notes: { a: { proof: "Confirmed" } },
        scheme: "http",
        followRequests: false,
      },
      version: 0,
    };
    entries.set("kebab-requestlab", JSON.stringify(saved));
    await useLabStore.persist.rehydrate();
    assert.equal(useLabStore.getState().bookmarks.a.proof, true);
    assert.equal(useLabStore.getState().notes.a.proof, "Confirmed");
    assert.equal(useLabStore.getState().scheme, "http");
    assert.equal(useLabStore.getState().followRequests, false);
  });
  it("does not persist captured payloads or session credentials", () => {
    const saved = JSON.parse(entries.get("kebab-requestlab")!);
    assert.deepEqual(Object.keys(saved.state).sort(), [
      "bookmarks",
      "followRequests",
      "notes",
      "scheme",
    ]);
  });
});
