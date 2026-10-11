import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  callbackSnippets,
  matchesRequest,
  createEvidence,
} from "../src/lib/lab";
import type { Request } from "../src/types";

const http: Request = {
  _id: "http-1",
  uid: "session",
  type: "http",
  date: 1700000000,
  ip: "10.0.0.1",
  raw: btoa("secret-body-marker"),
  method: "POST",
  path: "/callback",
  query: "?challenge=warmup",
  fragment: null,
  protocol: "https",
  url: "https://a.req.havet.dev/callback",
  headers: { "X-Challenge": "KebabEngineers" },
};

describe("CTF evidence tools", () => {
  it("searches headers, decoded body and query strings case-insensitively", () => {
    for (const query of [
      "kebabengineers",
      "SECRET-BODY-MARKER",
      "warmup",
      "10.0.0.1",
    ]) {
      assert.equal(matchesRequest(http, query), true);
    }
    assert.equal(matchesRequest(http, "absent"), false);
    assert.equal(matchesRequest(http, "   "), true);
  });
  it("handles malformed base64 without breaking search", () => {
    assert.equal(
      matchesRequest({ ...http, raw: "!invalid!" }, "callback"),
      true,
    );
  });
  it("finds SMTP subjects and DNS record types", () => {
    assert.equal(
      matchesRequest(
        {
          ...http,
          type: "smtp",
          command: "DATA",
          data: "body",
          subject: "Flag delivery",
          from: null,
          to: null,
          cc: null,
          bcc: null,
        },
        "flag delivery",
      ),
      true,
    );
    assert.equal(
      matchesRequest(
        {
          ...http,
          type: "dns",
          domain: "exfil.a.req.havet.dev",
          query_type: "TXT",
        },
        "txt",
      ),
      true,
    );
  });
  it("generates scheme-specific snippets and DNS without a port", () => {
    const snippets = callbackSnippets(
      "a.req.havet.dev:21337",
      "a.req.havet.dev",
      "https",
    );
    assert.ok(
      snippets
        .find((s) => s.label === "HTTP callback")
        ?.code.includes("https://a.req.havet.dev:21337"),
    );
    assert.equal(
      snippets.find((s) => s.label === "DNS callback")?.code,
      "nslookup probe.a.req.havet.dev",
    );
    assert.ok(
      callbackSnippets(
        "a.req.havet.dev",
        "a.req.havet.dev",
        "http",
      )[0].code.includes("http://"),
    );
  });
  it("exports request evidence with bookmarks and notes, without session credentials", () => {
    const evidence = createEvidence(
      "a",
      [http],
      { "http-1": true },
      { "http-1": "SSRF confirmed" },
    );
    assert.equal(evidence.requests[0].bookmarked, true);
    assert.equal(evidence.requests[0].note, "SSRF confirmed");
    assert.equal(evidence.requests[0].raw, http.raw);
    assert.equal("token" in evidence, false);
  });
});
