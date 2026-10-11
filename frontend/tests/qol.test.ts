import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { responsePreset, shortcutAction } from "../src/lib/qol";
import { visibleRequests } from "../src/lib/lab";
import type { Request } from "../src/types";

describe("response drafts", () => {
  it("creates JSON and CORS responses with the right headers", () => {
    const json = responsePreset("json");
    assert.equal(json.statusCode, "200");
    assert.equal(JSON.parse(json.body).team, "KebabEngineers");
    assert.ok(
      json.headers.some(
        (h) =>
          h.header === "Content-Type" && h.value.startsWith("application/json"),
      ),
    );
    assert.ok(
      responsePreset("cors").headers.some(
        (h) => h.header === "Access-Control-Allow-Origin" && h.value === "*",
      ),
    );
  });
  it("creates a body-free 204 response", () => {
    const draft = responsePreset("empty");
    assert.equal(draft.statusCode, "204");
    assert.equal(draft.body, "");
    assert.deepEqual(draft.headers, []);
  });
  it("accepts HTTP(S) redirects and rejects invalid or injected targets", () => {
    const draft = responsePreset(
      "redirect",
      "https://example.com/path?q=kebab",
    );
    assert.equal(draft.statusCode, "302");
    assert.ok(
      draft.headers.some(
        (h) =>
          h.header === "Location" &&
          h.value === "https://example.com/path?q=kebab",
      ),
    );
    for (const target of [
      "",
      "javascript:alert(1)",
      "https://example.com/\r\nX-Injected: yes",
    ]) {
      assert.throws(() => responsePreset("redirect", target));
    }
  });
  it("returns independent header arrays so editing a draft cannot corrupt another", () => {
    const first = responsePreset("html");
    first.headers[0].value = "changed";
    assert.notEqual(responsePreset("html").headers[0].value, "changed");
  });
});

describe("keyboard navigation", () => {
  it("ignores typing, open dialogs, browser shortcuts, and Alt combinations", () => {
    for (const event of [
      { key: "b", editing: true },
      { key: "j", modal: true },
      { key: "s", ctrlKey: true },
      { key: "1", altKey: true },
    ]) {
      assert.equal(shortcutAction(event), null);
    }
    assert.equal(shortcutAction({ key: "k", ctrlKey: true }), "search");
    assert.equal(shortcutAction({ key: "?" }), "help");
    assert.equal(shortcutAction({ key: "j" }), "next");
  });
  it("navigates the same filtered queue shown in the sidebar", () => {
    const request: Request = {
      _id: "a",
      uid: "s",
      type: "dns",
      date: 20,
      raw: "",
      ip: "127.0.0.1",
      domain: "probe.req.havet.dev",
      query_type: "TXT",
    };
    const rows = [
      { ...request, _id: "later", date: 30 },
      { ...request, _id: "early", date: 10 },
    ];
    assert.deepEqual(
      visibleRequests(rows, {
        http: true,
        dns: true,
        smtp: true,
        search: "probe",
        onlyBookmarks: true,
        bookmarks: { early: true },
      }).map((r) => r._id),
      ["early"],
    );
    assert.deepEqual(
      visibleRequests(rows, {
        http: true,
        dns: false,
        smtp: true,
        search: "",
        onlyBookmarks: false,
        bookmarks: {},
      }),
      [],
    );
  });
});
