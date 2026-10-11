# KebabEngineers Request Lab

Liam's frontend fork of [adrgs/requestrepo](https://github.com/adrgs/requestrepo),
served at **https://req.havet.dev**. The `kebab-lab` branch starts from upstream
`73f3d3082d8570508f5fe29864411bcc15379ddb`, matching the deployed backend.

## What changed

- Charcoal/amber and cream themes, original skewer artwork, a branded sign-in,
  and a callback cookbook with copy buttons for HTTP, POST, DNS, JS, HTML, SMTP.
- HTTP/HTTPS choice for copied URLs and snippets. HTTPS is the default; this
  affects generated URLs only, not the server's listening ports.
- Request bookmarks, a bookmarks-only filter, and per-request evidence notes.
- JSON export for one request or the currently filtered queue, including raw
  payloads, bookmarks and notes. Session credentials are excluded. Captured
  requests themselves may contain sensitive data, so review exports before sharing.
- Search also covers headers, query strings, decoded raw payloads and email fields.
- Pause/follow for automatic queue scrolling. Capture continues while paused.
- Mobile queue closes when a request is selected; keyboard focus is visible.
- Confirmation before deleting an entire session's captured requests.
- Challenge labels for sessions, with a tag button in the header. Labels stay with
  the logical session when you rotate its callback URL, and sync between tabs.
- A response cookbook for HTML, JSON, CORS-enabled JSON, HTTP(S) redirects and
  204 responses. Applying a preset changes the current draft; press Save to publish.
  The editor shows whether a draft is unsaved and resets it when changing sessions.
- Keyboard shortcuts: `/` or Ctrl/Cmd+K for search; J/K for next/previous visible
  request; B to bookmark; C to copy the callback URL; P to pause/follow; 1/2/3 for
  Requests/Response/DNS; `?` for the guide. Single-key shortcuts ignore typing and
  dialogs. Ctrl/Cmd+S still saves in the response editor.

Labels, bookmarks, notes, scheme and follow preferences are saved **in this browser**.
They do not persist captured requests. The upstream backend still uses its
temporary in-memory cache, so export anything you need to preserve. Deployment
restarts also clear that cache; existing session tokens remain compatible.

## Development and checks

The checkout is tracked in fleet. Bun is pinned by `.bun-version`.

```sh
cd frontend
bun install --frozen-lockfile
bun test tests
bun run lint
bun run build
REQUESTLAB_BACKEND=https://req.havet.dev VITE_DOMAIN=req.havet.dev VITE_HTTP_PORT=443 bun run dev
```

The optional browser check uses the admin password from
`~/.config/havet/secrets/req.env` without printing it. It creates its own session
and verifies capture, notes/bookmarks, reload, downloaded evidence, search,
pause/follow, snippets, response editing, themes and mobile layout.
With Playwright's browser installed, run `node tests/browser.mjs` from `frontend`.
Set `REQUESTLAB_URL=https://req.havet.dev` to check the deployed app, or
`CHROMIUM_PATH` to use an existing browser binary. Set `REQUESTLAB_SCREENSHOTS`
to a directory to save visual checks. `node tests/qol-browser.mjs` checks named
sessions, keyboard shortcuts, preset drafts and live response status/headers,
cross-session editor isolation and mobile controls using the same environment flags.

## Deployment and upgrades

`Dockerfile.kebab` builds only the customized frontend and overlays it onto the
pinned upstream image. The Rust API, authentication, HTTP/HTTPS, DNS, SMTP,
certificate storage, and container user are inherited from that image.

The actual deployment lives in `~/dev/havet.dev/sites/req`. Its Dockerfile fetches
this fork at an exact commit, verifies the source archive checksum and builds the
frontend; the compose file retains the existing ports, secrets, limits and
certificate volume. Update the pinned commit/checksum there, then run
`havet deploy req`. Reverting the compose file to
`image: ghcr.io/adrgs/requestrepo:73f3d30` restores the upstream UI.

To upgrade, compare upstream first and test the UI against the intended backend.
Update the backend pin and frontend base together if the API changes. Keep the
upstream MIT license and attribution.
