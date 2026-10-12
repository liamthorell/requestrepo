# N-address DNS Rebinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Native execution is recommended for this plan because the engine, wire-response handling, API, and UI share a tightly coupled contract.

**Goal:** Ship six configurable DNS rebinding strategies and an accessible N-address editor on req.havet.dev.

**Architecture:** A typed rebinding module owns validation, pure selection, and atomic session runtime state. HTTP/HTTPS and DNS share one store; DNS constructs and serializes the response inside a synchronous selection transaction before advancing counters. React edits session-scoped drafts and uses authenticated configuration, preview, reset, and manual-phase APIs.

**Tech Stack:** Existing Rust/Tokio/Axum/Hickory/Serde/Rand backend; React/TypeScript/HeroUI/TanStack Query/Bun frontend; existing havet deployment CLI. No new service, secret, or dependency is required.

**Spec:** `docs/superpowers/specs/2026-10-12-dns-rebinding-design.md` (approved by the user).

## Global Constraints

- Support 1–128 phases and at most 128 address values in a profile, and at most 16 profiles per session.
- TTL and negative TTL accept zero through 86,400 seconds.
- Query counts accept 1 through 1,000,000; durations accept 1 millisecond through 24 hours; weights accept integers from 0 through 1,000,000, with at least one nonzero weight for random selection.
- Bound runtime state to 1,024 keys per session and 65,536 keys for the process.
- No asynchronous operations or network I/O occur while holding its lock.
- Profile status refreshes every two seconds only while the DNS rebinding view is active.
- Configuration and runtime state remain in memory; export/import excludes credentials.
- UDP truncation does not advance counters; A/AAAA counters remain separate; unmatched and certificate queries retain existing behavior.
- Deploy with `havet deploy req`; do not modify the shared proxy or other production applications.
- Use fleet before any tool installation, checkout, environment-file change, or secret storage. Existing tool commands are available; do not install globally.

## Review Focus

1. A save or preview response arrives after switching sessions: it must not change the new session's draft or preview (Task 6 browser test).
2. Mixed-case names, `@`, and near-matching suffixes: canonical matching must never cross session boundaries (Tasks 1 and 3 tests).
3. A wildcard profile meets `_acme-challenge` or non-address questions: certificate renewal and unrelated records must remain unchanged (Task 3 test).
4. Quota exhaustion or configuration replacement occurs while DNS queries run: preserve old configuration on failure and never recreate obsolete state (Tasks 2 and 4 tests).
5. An imported list contains duplicate IDs, invalid IPv6, 129 addresses, or oversized strings: reject it visibly without replacing a valid draft/configuration (Tasks 1, 5, and 6 tests).

## Workspace and file map

At execution time, use the using-git-worktrees skill to create or select an isolated requestrepo worktree based on `kebab-lab`, including the committed spec and plan. Read applicable AGENTS.md files. Preserve `/home/liam/dev/havet.dev`'s existing unrelated `infra/orcy/` files. Run baseline checks before product edits; document pre-existing failures rather than changing unrelated code.

Backend files to create: `src/src/rebinding/{mod.rs,model.rs,validation.rs,selector.rs,store.rs}`, `src/src/http/rebinding_routes.rs`, and `src/src/tests/{rebinding_tests.rs,rebinding_api_tests.rs}`. Existing files to modify: `src/src/lib.rs`, `src/src/cache/mod.rs`, `src/src/dns/mod.rs`, `src/src/models/mod.rs`, `src/src/http/{mod.rs,routes_v2.rs}`, `src/src/utils/names.rs`, and `src/src/tests/{mod.rs,cache_tests.rs,dns_tests.rs,names_tests.rs}`.

Frontend files to create: `frontend/src/types/rebinding.ts`, `frontend/src/api/rebinding.ts`, `frontend/src/lib/rebinding.ts`, `frontend/src/hooks/useRebinding.ts`, `frontend/src/components/dns/{RebindingPanel.tsx,ProfileEditor.tsx,PhaseEditor.tsx,RebindingPreview.tsx,RebindingStatus.tsx}`, and `frontend/tests/{rebinding.test.ts,rebinding-browser.mjs}`. Existing files to modify: `frontend/src/pages/{DnsSettingsPage.tsx,RequestsPage.tsx}`, `frontend/src/types/index.ts`, and, only where needed for these components, `frontend/src/index.css`.

Deployment files: `/home/liam/dev/havet.dev/sites/req/Dockerfile`; usage documentation: `README.md`. Split components by these responsibilities instead of expanding the existing large request viewer or DNS match statement.

## Shared contract

Use snake_case JSON fields and enum values. Define Rust structs in `rebinding/model.rs` and mirror the wire shapes in `frontend/src/types/rebinding.ts`:

- `Profile { id, name, enabled, hostname, answer_kind, strategy, scope, final_behavior, unmatched_family, negative_ttl, rrset_ttl, phases }`.
- `Phase { id, label, values: Vec<String>, ttl: u32, query_count: u32, duration_ms: u64, weight: u32 }`.
- Enum values: answer kind `A | AAAA | CNAME`; strategy `count | timed | round_robin | random | multiple | manual`; scope `hostname | resolver | profile`; final behavior `hold | repeat`; unmatched family `nodata | fallback`.
- `Snapshot { generation: u64, profiles: Vec<Profile>, status: Vec<ProfileStatus>, capacity: CapacityStatus }`. A status contains `profile_id`, `state_keys`, aggregate `queries`, `last_phase_ids`, and optional `manual_phase_id`. Capacity includes session/process usage and limits. Wire generation values must remain within JavaScript's safe integer range; refuse exhausted generations without mutation.
- `UpdateRequest { expected_generation: u64, profiles: Vec<Profile> }`; `ActionRequest { expected_generation: u64 }`; `PhaseRequest { expected_generation: u64, phase_id: String }`.
- `PreviewRequest { profile: Profile, query_type: String, query_index: u64, elapsed_ms: u64, random_slot: Option<u64>, manual_phase_id: Option<String> }`. Query index is zero-based and elapsed time is relative to the hypothetical first query. Omitted random slots select slot zero reproducibly; the UI can request other slots without drawing from the live engine.
- `Selection { answer_kind, values, ttl, phase_ids, status }`; status is `answer | suppressed | capacity`; suppression has no values and uses negative TTL. `PreviewResponse { selection, probabilities }` includes normalized per-phase random probabilities.
- `RebindingMetadata { profile_id, profile_name, generation, phase_ids, strategy, scope, query_index: Option<u64>, status, committed: bool }` is an optional DNS-log field. A truncated response records `committed: false`.
- Structured failures use `{ error, code, field?: string }`, including `invalid_rebinding`, `generation_conflict`, `rebinding_capacity`, `profile_not_found`, and `invalid_action`. Deserialization errors use field `$`; validation uses paths such as `profiles[0].phases[2].values[0]`.

IDs are unique in their collection, 1–64 ASCII alphanumeric/underscore/hyphen characters. Profile names and phase labels are at most 128 characters. Enforce the HTTP body limit before decoding. Accept canonical DNS names using Hickory and canonical IP addresses using Rust's parsers. These bounds keep configuration and runtime allocation estimates finite.

### Task 1: Typed profiles, validation, and pure strategy selection

**Files:** Create `rebinding/{mod.rs,model.rs,validation.rs,selector.rs}` and `tests/rebinding_tests.rs`; modify `lib.rs` and `tests/mod.rs` to register them.

**Interfaces:** Produces `validate_profiles(profiles: Vec<Profile>) -> Result<Vec<Profile>, ValidationError>`, `match_profile<'a>(profiles: &'a [Profile], relative_name: &str, query_type: &str) -> Option<ProfileMatch<'a>>`, and `select(profile: &Profile, context: &SelectionContext) -> Result<Selection, ValidationError>`. `SelectionContext` contains zero-based query index, elapsed milliseconds, a uniform integer random slot in `[0, total_weight)`, and an optional manual phase ID. `ProfileMatch` distinguishes a direct answer from unmatched-family suppression. Matching is pure and excludes any relative label `_acme-challenge` from rebinding.

- [ ] Write failing tests named `count_uses_all_three_phases`, `rotation_visits_128_phases`, `timed_boundaries_hold_and_repeat`, `weights_select_all_nonzero_entries`, `multiple_deduplicates_with_one_ttl`, and `manual_selects_any_phase`. Assert three count phases with dwell lengths `[1, 2, 1]` select indices `[0, 1, 1, 2, 2]` in hold mode and `[0, 1, 1, 2, 0]` in repeat mode. Assert a 128-entry rotation visits every entry before returning to the first. Assert slots `[0, 1, 3]` select phases `[0, 1, 2]` for weights `[1, 2, 1]`.
- [ ] Add validation/matching tests: one-phase success; empty/129-phase and 129-address failures; 16-profile success/17-profile failure; TTL boundaries `0`, `86_400`, `86_401`; duration boundaries `1`, `86_400_000`, `86_400_001`; duplicate IDs; zero total weight; malformed IPv4/IPv6/CNAME; oversize labels; invalid owner patterns; canonicalized mixed-case names; `*` excludes `@`; exact wins; overlapping CNAME/address profiles fail. Test large query indices and elapsed values without overflow.
- [ ] Run `cargo test --manifest-path src/Cargo.toml --locked rebinding` with a test-only JWT secret supplied by the test launcher in memory; expect failures because the module/functions are absent.
- [ ] Implement the contract using checked sums and modular arithmetic for repeat cycles, deduplicating parsed addresses in insertion order. Do not introduce network lookups, timers, or locks into selection.
- [ ] Rerun the focused tests; require all passing. Run `cargo fmt --manifest-path src/Cargo.toml -- --check`.
- [ ] Commit only the task's files with `feat: add N-phase rebinding models and selectors`.

### Task 2: Atomic bounded runtime state and cache accounting

**Files:** Create `rebinding/store.rs`; modify `rebinding/mod.rs`, `cache/mod.rs`, `tests/{rebinding_tests.rs,cache_tests.rs}`.

**Interfaces:** Consumes Task 1 validation/matching/selection. Produces `Store::new(cache: Arc<Cache>) -> Store`, `snapshot(&self, session: &str) -> Snapshot`, `replace(&self, session: &str, request: UpdateRequest) -> Result<Snapshot, RebindingError>`, `reset(&self, session: &str, profile_id: &str, expected_generation: u64) -> Result<Snapshot, RebindingError>`, `set_phase(&self, session: &str, profile_id: &str, request: PhaseRequest) -> Result<Snapshot, RebindingError>`, and `clear_session(&self, session: &str) -> Result<(), RebindingError>`.

The DNS interface is synchronous: `answer<F, R>(&self, lookup: &LookupContext, now: Instant, draw: R, render: F) -> Result<Option<ResolvedAnswer>, RebindingError>` where `R: FnOnce(u64) -> u64` draws one uniform random slot given total weight, and `F: FnOnce(&Selection) -> Result<RenderedAnswer, RebindingError>` serializes a candidate. `LookupContext` owns session, normalized relative name, query type, and resolver IP. `RenderedAnswer { wire: Vec<u8>, truncated: bool }`; `ResolvedAnswer { wire, metadata }`. A truncated or failed render does not increment queries, start a clock, or allocate a new key. `None` means existing static DNS must answer.

Add synchronous cache quota reservations: `replace_external_usage(&self, key: &str, session: &str, bytes: usize) -> anyhow::Result<()>` and `release_external_usage(&self, key: &str) -> anyhow::Result<()>`. Charge profile/string/vector/map allocations and runtime keys conservatively, not merely serialized payload length. Coordinate reservations with normal cache writes so failed reservations do not alter memory/subdomain totals. Use a documented lock order: name registry when ownership is guarded, then store, then cache quota coordination. Cache operations never acquire the store lock; resolve static cache-key ownership before taking cache locks, and explicit-session rebinding reservations never call the name registry.

- [ ] Write failing tests for atomic replacement with stale generations, all mutation generation increments, failed serialization preserving counters, truncated responses preserving first phase and timer, side-effect-free reads, A/AAAA separation, all three scopes, and manual selection affecting existing/new keys. Inject `Instant` values directly instead of sleeping.
- [ ] Test 100 concurrent qualifying answers to a profile whose first phase lasts 10 queries: exactly 10 results use phase one. Race replacement/reset against selection and assert no old-generation keys reappear. Verify disabling/deleting a profile frees keys and reset retains its configuration.
- [ ] Test the 1,024-per-session limit with 1,025 unique hostnames; existing keys still answer and the new key reports capacity. Use test-only constructor limits to exercise process exhaustion without allocating 65,536 keys. Assert failed quota reservations preserve the current profile collection and cache statistics, and clearing a session releases reservations.
- [ ] Run focused Rust tests; expect failure before runtime implementation.
- [ ] Implement one shared store with atomic configuration/runtime transactions. Validate and prepare replacement configuration before locking; never await inside transactions. Serialize/size-check the candidate before committing state. Protect counters, duration sums, and generation increments from overflow.
- [ ] Run focused tests and existing cache tests; require all passing. Commit with `feat: add atomic bounded rebinding runtime`.

### Task 3: Authoritative UDP/TCP answers and truthful capture logs

**Files:** Modify `lib.rs`, `dns/mod.rs`, `http/mod.rs`, `models/mod.rs`, and `tests/dns_tests.rs`. Add default store instances to existing HTTP/DNS test constructors as necessary.

**Interfaces:** Consumes `Arc<Store>` and Task 2 `answer`. Instantiate it once in `lib.rs` and pass it to `dns::Server::new`, `http::Server::new`, and `http::HttpsServer::new`; include it in `AppState`. Add the shared store parameter to DNS query and TCP-handler helpers and update their callers. Add `Option<RebindingMetadata>` to `DnsRequestLog` with serde default/omission for backward compatibility.

- [ ] Write failing wire tests for three successive addresses over UDP and TCP, two-address phase answer sets, TTL zero, independent AAAA profiles, unmatched-family NODATA and fallback, CNAME answers to A/AAAA questions, and exact/wildcard precedence within one session.
- [ ] Add an oversized 128-address response test: UDP has TC set, no answers, and no consumed state; the next TCP response returns all addresses with the configured TTL. Assert captured `reply` describes the actual TC response and metadata has `committed: false`. A later nontruncated answer advances once.
- [ ] Test unrelated TXT/MX/NS/SOA and `_acme-challenge` queries bypass selection and leave counters unchanged. Test uppercase names, `@`, unrelated zone names, and lookalike session suffixes. Verify capacity renders SERVFAIL and capture metadata explains the cause.
- [ ] Run `cargo test --manifest-path src/Cargo.toml --locked dns_tests`; expect new tests to fail before integration.
- [ ] Integrate selection ahead of static address handling. In the render closure, build Hickory records, use a configurable negative SOA TTL for suppressed family responses, truncate when required, and serialize. Log the resulting wire message after the store transaction; do not log the pretruncation candidate. Preserve existing rate and connection limits.
- [ ] Rerun DNS and rebinding tests, including existing TCP framing/connection tests. Commit with `feat: serve rebinding profiles over UDP and TCP`.

### Task 4: Authenticated configuration, actions, and preview API

**Files:** Create `http/rebinding_routes.rs` and `tests/rebinding_api_tests.rs`; modify `http/{mod.rs,routes_v2.rs}`, `utils/names.rs`, and `tests/{mod.rs,names_tests.rs}`.

**Interfaces:** Consumes Task 2 store and Task 1 pure selector. Reuse `TokenQuery` and expose the existing `verify_token_or_error` as `pub(super)` rather than duplicating auth. Export route handlers `get_rebinding`, `update_rebinding`, `reset_rebinding`, `select_rebinding_phase`, and `preview_rebinding`, each returning Axum `Response`. Register the five approved `/api/v2/dns/rebinding` routes. Expose `create_router` as `pub(crate)` solely for real router integration tests.

Add `names::with_current_claim<T>(name: &str, id: &str, operation: impl FnOnce() -> T) -> Option<T>` to check and hold the registry read lock around a synchronous store operation, and `names::release_with_cleanup<E>(name: &str, id: &str, cleanup: impl FnOnce() -> Result<(), E>) -> Result<bool, E>` to check under the registry write lock, run cleanup, and only then remove/persist the claim. Extract the signed claim ID using existing `jwt_claim_id`; random-name tokens use the normal authenticated store path. Do not invoke JWT verification or other registry readers inside these closures. Retain the existing release API as a wrapper with a no-op cleanup for its other callers.

- [ ] Write router tests using `tower::ServiceExt::oneshot`: no/invalid/share token rejection; valid session ownership; GET generation zero before config; PUT then GET equality; invalid update preserving prior config; stale PUT/reset/phase HTTP 409; missing profile HTTP 404; invalid action HTTP 400; quota HTTP 413 with structured code; successful reset/phase incrementing generation. Do not test only helpers or simulated cache writes.
- [ ] Test malformed JSON/unknown enums produce structured `invalid_rebinding` errors and do not mutate configuration. Test a draft preview returns an answer for query index 2 in a three-phase sequence while live snapshot/counters/random source remain unchanged. Reject nonmanual phase selection and unknown phase IDs.
- [ ] Test custom-name release clears profiles and runtime reservations before another claim can use the name, and that static/certificate records outside the released session remain untouched. Block a stale owner's mutation at the claim guard, release/reclaim the name, and assert the stale mutation is rejected without affecting the new owner. Assert failed cleanup preserves the old claim and that lock-order tests complete within a bounded timeout.
- [ ] Run focused API tests; expect failures before route implementation.
- [ ] Implement typed body decoding with mapped `JsonRejection`, canonical validation responses, atomic store operations, and pure preview; add no offline-success fallback. Wire store cleanup into successful custom-name release. Return canonical `Snapshot` from all mutations.
- [ ] Run API, auth, name, DNS, and rebinding tests; require all passing. Commit with `feat: expose session-owned rebinding configuration API`.

### Task 5: Frontend contract, N-address editing helpers, and drafts

**Files:** Create `types/rebinding.ts`, `api/rebinding.ts`, `lib/rebinding.ts`, `hooks/useRebinding.ts`, and `tests/rebinding.test.ts`; modify `types/index.ts` for optional capture metadata.

**Interfaces:** Mirror the Shared contract exactly. Export API functions `getRebinding(token: string): Promise<Snapshot>`, `updateRebinding(token: string, request: UpdateRequest): Promise<Snapshot>`, `resetRebinding(token: string, profileId: string, generation: number): Promise<Snapshot>`, `selectRebindingPhase(token: string, profileId: string, request: PhaseRequest): Promise<Snapshot>`, and `previewRebinding(token: string, request: PreviewRequest): Promise<PreviewResponse>` using bearer auth and `/api/v2`.

Export pure helpers `createProfile(preset: Preset, serverIp: string): Profile`, `parseAddressList(text: string, kind: 'A' | 'AAAA'): string[]`, `applyBulkAddresses(profile: Profile, values: string[], mode: 'phases' | 'rrset'): Profile`, `movePhase(profile: Profile, phaseId: string, direction: -1 | 1): Profile`, `validateDraft(profiles: Profile[]): FieldError[]`, `exportProfiles(profiles: Profile[]): string`, and `importProfiles(text: string): Profile[]`. Import/export format is `{ version: 1, profiles }`; reconstruct known fields rather than preserving arbitrary credential fields. Server validation remains authoritative.

`useRebinding(token: string, active: boolean)` owns the query, draft, dirty state, errors, preview and mutations. Keep drafts in memory keyed by the complete session token; use an abort signal or request identity for previews and capture the original token in mutation callbacks. Key the rendered panel by session token. Poll every 2 seconds only when active and the document is visible. Status refresh must not overwrite dirty drafts.

- [ ] Write failing Bun tests for newline/comma bulk lists, 3/10/128 entries, 129-entry rejection, IPv6 literals, duplicate IDs, list reorder preserving values/IDs, all five presets, zero TTL, normalized random probabilities, and malformed imports. Assert export contains neither `token` nor `password` even when input includes extraneous fields.
- [ ] Add tests for single-phase and multi-address creation, per-phase controls retaining their values across strategy changes, and validation parity for all specified numeric bounds. Each preset yields a valid editable profile; presets never invoke save APIs.
- [ ] Run `bun test tests/rebinding.test.ts` from `frontend`; expect failures before helpers exist.
- [ ] Implement types/API/helpers/hook using existing dependencies. Reuse existing axios error formatting; structured field errors remain available to the form. Limit manual/preview controls to compatible strategies. Do not recreate live strategy selection in TypeScript: ask the preview API.
- [ ] Run focused tests, `bun run build`, and `bun run lint`; resolve new failures. Commit with `feat: add N-address rebinding editor data and API client`.

### Task 6: Configurable UI, live feedback, and browser regression checks

**Files:** Create `components/dns/{RebindingPanel,ProfileEditor,PhaseEditor,RebindingPreview,RebindingStatus}.tsx` and `tests/rebinding-browser.mjs`; modify `pages/{DnsSettingsPage,RequestsPage}.tsx` and scoped CSS if needed.

**Interfaces:** `RebindingPanel({ token, subdomain, active }: { token: string; subdomain: string; active: boolean })` consumes Task 5 hook. `ProfileEditor` edits one `Profile`; `PhaseEditor` edits one `Phase` and exposes labeled reorder/delete actions. `RebindingPreview` displays `PreviewResponse` and hypothetical context; `RebindingStatus` displays applied snapshot/capture metadata. Keep field edit callbacks typed rather than passing the session store into child components.

- [ ] Write a browser regression scenario for a local integrated backend/frontend. Create isolated sessions, navigate DNS → Rebinding, bulk-paste three addresses into individual phases, reorder the third to first, apply, run a draft preview at query index 2, and verify the live query total is unchanged. Cover add/remove, weight/count/duration/TTL controls, 128-entry import, export without credentials, reset, and selecting the third manual phase.
- [ ] Add scenarios for server validation and 409 conflicts retaining drafts, a delayed save/preview response after session switching, status polling preserving unsaved edits, phase/address labels usable by keyboard, and Records/Rebinding precedence explanations. Use route-controlled delayed responses for the cross-session race; do not rely on arbitrary sleeps.
- [ ] Run the new scenario before UI implementation; require failure on the missing Rebinding controls. Browser runner may use the repository's existing Playwright workflow; do not install another browser/tool ad hoc. Read-only/manual UI verification should prefer T3 preview tools.
- [ ] Build Records/Rebinding navigation, profile CRUD/enable/presets, exact/wildcard hostname preview, ordered N-phase editor, bulk modes, all strategy variables, advanced family/scope/final/negative-TTL controls, explicit Save/Reset/manual actions, capacity status, JSON import/export, and `dig` snippets. Defaults use req's editable public address `79.76.62.80`. Draft previews must be visibly labeled and never imply actual traffic.
- [ ] Extend the DNS request view with optional profile/phase/generation/scope metadata and a clear resolver label. Render old captures unchanged. Explain configuration volatility, save/reset counter behavior, and the fact that low TTL cannot clear client caches.
- [ ] Run the scenario against a local server at desktop and 360px widths; require no uncaught errors, clipped fields/actions, or horizontal page overflow. Run all Bun tests, build, and lint. Commit with `feat: add configurable N-address DNS rebinding UI`.

### Task 7: Full verification, documentation, and req deployment

**Files:** Update `README.md`, `/home/liam/dev/havet.dev/sites/req/Dockerfile`, and optionally the task checklist in this plan. Keep unrelated havet files untouched.

**Interfaces:** Consumes all implemented behavior. Builds the source at an immutable Git commit; deploys through the existing havet CLI and verifies its authoritative nameserver at `79.76.62.80` over UDP and TCP.

- [ ] Document six strategies, N-phase/answer-set examples, resource bounds, counter semantics, state scope, import/export, generation conflicts, and DNS caching/rebinding-protection limitations. Include a three-address count example and a multiple-answer `dig` example.
- [ ] Run `cargo fmt --manifest-path src/Cargo.toml -- --check` and `cargo test --manifest-path src/Cargo.toml --locked` with the test launcher's temporary in-memory JWT secret. Run `bun test`, `bun run build`, and `bun run lint` in `frontend`; rerun the integrated browser scenario only after changes or failures justify it. Perform a final whole-branch review per the chosen execution workflow and fix material findings.
- [ ] Before deployment, report that req's restart clears existing in-memory captures/DNS configuration and ensure any user preservation instruction is satisfied. This is the existing service behavior, not a reason to request authorization already granted for the feature deployment.
- [ ] Commit verified source changes and integrate them into `kebab-lab` through the approved workflow, preserving unrelated work. Push the exact source commit to GitHub. If any PR is created, immediately register its full URL with T3 `link_pull_request`, and verify thread PR links before finishing.
- [ ] Download the source archive for that immutable commit, compute its SHA-256, and replace only `REQUESTLAB_COMMIT` and `REQUESTLAB_SHA256` in the req Dockerfile. Verify the downloaded checksum matches the pin and `git diff --check` passes. Read the havet skill before deployment; run `havet deploy req` from the havet repository. Retain the prior pin/checksum for rollback.
- [ ] Verify `/health`, authenticated UI, and existing static TXT/A behavior. Create a temporary authenticated QA session using credentials read into process memory without printing them. Set a three-address profile, query `dig @79.76.62.80 <profile-host> A +noall +answer` and then `+tcp`, and assert actual phase progression/TTL. Test an oversized multiple-address profile's UDP truncation and TCP full answer; reset state between independent checks. Confirm captures show the actual replies and metadata, then remove the QA profiles and release any temporary claimed name.
- [ ] Inspect status/logs for req only if verification fails; fix/redeploy or restore the previous pin and redeploy req. Report the deployed source commit, verified URL and behavior, and any remaining concrete limitation. Never claim deployment success from the build alone.

## Verification launcher and execution handoff

Use a small Python or JavaScript launcher to put randomly generated test-only `JWT_SECRET` and local runtime settings into a subprocess environment. Do not print the generated secret or write a new `.env`; use domain `localhost`, unprivileged DNS/SMTP ports, and a small TCP port range for local integrated tests. Existing production `ADMIN_TOKEN` is needed only for deployment QA, and must be read from its existing secret file without appearing in command text/output, screenshots, or exports.

The plan has seven sequential deliverables. Recommend **Native execution**: implement each task in this session using executing-plans, then obtain the workflow's whole-branch review. **Subagent-driven execution** is also available, with an implementer/reviewer round for each task and a final branch review; choose it explicitly if the extra independent review is preferred. Do not begin product implementation until the user has reviewed this plan and selected the execution method.
