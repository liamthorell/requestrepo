# Configurable DNS rebinding for req.havet.dev

## Intent and approved scope

Make KebabReq useful for repeatable DNS rebinding experiments in CTF challenges. Users need multiple techniques, convenient configuration of the variables controlling answers, and enough visibility to understand why an experiment behaved as it did.

The user approved the proposed interface and six strategies, then explicitly required support for N IP addresses instead of a two-address limit. Address and phase arrays are fundamental to the model; there are no special `initial_ip` and `target_ip` fields. The previous two-address mockup illustrated one example, not a restriction.

Success means a user can configure, run, inspect, and reset a profile from the DNS page; changing the strategy must change actual authoritative DNS replies over both UDP and TCP.

## Current system and chosen approach

The source is `liamthorell/requestrepo`, branch `kebab-lab`. The deployment is pinned in `/home/liam/dev/havet.dev/sites/req/Dockerfile`; its currently deployed source commit is `185d2a5079e2106073e67e1ece95ee173a3afb1c`.

The Rust DNS server supports static A, AAAA, CNAME and TXT settings, including random selection from `%`-separated addresses. Address TTLs are hardcoded to one second. HTTP and HTTPS expose authenticated session APIs and share an in-memory cache with the DNS server. Custom session names persist, but captures and DNS configuration currently disappear on restart.

Add session-owned rebinding profiles with a shared runtime engine. This supports counters, timers, explicit phase selection, and inspection more directly than extending the `%` syntax or encoding configuration in hostname labels. Existing static DNS behavior remains the fallback for names without a matching enabled profile. Configuration and runtime state remain in memory, consistent with existing DNS settings; the UI states this explicitly and provides JSON export/import for saving experiments.

## Configuration model

A session owns an ordered collection of profiles. Each profile has an ID, name, enabled flag, hostname pattern, answer kind (`A`, `AAAA`, or `CNAME`), strategy, state scope, final-phase behavior, unmatched-address-family behavior, negative TTL, a TTL used by multiple-address mode, and an ordered array of phases.

Hostname patterns are relative to the authenticated session: `@` for the session hostname, an exact relative hostname such as `rebind`, or `*` for all names beneath the session hostname. `*` does not include `@`. Names are canonicalized case-insensitively. Configuration cannot claim another session or the service zone apex.

Each phase has a stable ID, label, answer values, TTL, query count, duration in milliseconds, and weight. A/AAAA phases contain one or more valid addresses of their declared family. A CNAME phase contains exactly one valid absolute target name. Fields not used by the selected strategy remain editable in advanced settings but do not affect selection. TTL and negative TTL accept zero through 86,400 seconds. Query counts accept 1 through 1,000,000; durations accept 1 millisecond through 24 hours; weights accept integers from 0 through 1,000,000, with at least one nonzero weight for random selection.

Support 1–128 phases and at most 128 address values in a profile, and at most 16 profiles per session. These are resource limits, not a two-address model. Lists with three, ten, or 128 entries must use the same implementation path. Validation errors report the limit and offending field without truncating input silently.

## Strategies and N-address semantics

1. **Switch after N queries:** Serve each phase's answer set for its configured number of matching queries, then advance through the complete phase list. After the final phase's count, either hold that phase or repeat from the beginning. A single-phase profile always serves that phase.
2. **Switch after a delay:** Start an independent monotonic clock at the first qualifying query for each state key. Advance according to cumulative phase durations, holding the last phase or repeating the full duration cycle. No blocking sleep is involved in answering DNS.
3. **Alternate / round robin:** Cycle through the entire phase list using each phase's query count as its dwell length. This is rotation over N phases, including the original two-address alternating case. It always repeats.
4. **Weighted random:** Independently select one phase on each qualifying query using the weights across the complete list. A selected phase returns its answer set. Show normalized probabilities for every phase. Zero-weight phases are never chosen; there is no initial/target-specific probability field.
5. **Multiple addresses per answer:** For an A or AAAA profile, return the deduplicated union of addresses from all phases as one RRset in configured order. This mode uses one profile-level RRset TTL so every member has the same TTL. Configured order describes the authoritative reply, not a guarantee about resolver reordering or client address choice. CNAME profiles cannot use this mode.
6. **Manual switching:** Serve the explicitly selected phase until the user selects another phase. The UI can choose any phase directly or move to the next phase. Selecting a phase applies to every runtime state key of that profile and does not require a DNS query to take effect.

In the other strategies, a phase can itself contain multiple address values: those values are returned together with that phase's TTL. This supports both N successive destinations and N simultaneous addresses without disguising one as the other.

## Matching, IPv6, and counter semantics

An enabled exact profile wins over an enabled wildcard profile for the same answer kind. Reject duplicate enabled profiles at the same specificity and answer kind. A matching enabled profile takes precedence over static records, with that precedence visible in both editors. Disabled profiles do not shadow static records.

A and AAAA profiles can independently configure the same hostname. An A profile includes an explicit choice for unmatched AAAA queries: return NODATA with its negative TTL (default), or retain existing static/default AAAA behavior. A matching AAAA profile wins over this choice. Apply the corresponding choice to unmatched A queries for an AAAA-only profile. NODATA does not advance an address-family profile's counters.

A CNAME profile serves a CNAME for A, AAAA, and CNAME queries at its owner name. Reject simultaneously enabled address profiles with overlapping owner patterns, since a CNAME owner cannot also supply address records. External CNAME targets are returned to the resolver for normal resolution; the service does not perform recursive lookups. TXT, NS, SOA, MX, certificate-challenge records, and unrelated queries keep existing behavior and do not advance rebinding state.

State scope choices are: per queried hostname and query type (default); per hostname, resolver source IP and query type; or shared across the profile for each query type. A and AAAA requests do not unintentionally consume each other's phase counts. Resolver source IP is labeled as the DNS resolver, not the browser or application client; it is not an authenticated identity.

Count qualifying, nontruncated DNS responses, including retransmitted queries. No attempt is made to equate authoritative query count with application requests or unique visitors. UDP and TCP share the same state and selection logic. A UDP response requiring truncation does not advance state; its TCP retry can obtain the same phase. Logs describe the actual serialized response, including truncation, rather than logging an answer set that was not sent.

## Backend boundaries and state lifetime

Create a focused rebinding module containing typed configuration, validation, a pure strategy selector, and a shared runtime store. Pass the same store to HTTP, HTTPS, and DNS from server initialization. Do not add strategies directly to the existing large DNS match statement.

The engine matches a session and normalized question, selects the candidate response, and commits the state transition only when a nontruncated response is ready for serialization. Selection and transition for a state key are atomic across concurrent queries. No asynchronous operations or network I/O occur while holding its lock. Configuration replacement, reset, and manual switching are atomic with selection; generation numbers prevent a request from recreating state belonging to a superseded configuration.

Bound runtime state to 1,024 keys per session and 65,536 keys for the process. Existing keys continue working when capacity is reached; a new key returns SERVFAIL and logs a capacity error. Do not silently evict keys and restart experiments. The UI exposes usage and reset controls. Profile deletion releases its keys. Successful custom-name release clears rebinding configuration and state before the name can be reassigned. Configuration storage participates in existing per-session and process memory limits.

Saving changed configuration resets its state and visibly explains that behavior. Disabling a profile clears its runtime keys. Reset clears the profile's counters and clocks and selects the first manual phase. Reset cannot clear caches held by external resolvers or browsers. Preview evaluates a supplied hypothetical query index and elapsed time without inserting state, consuming randomness in the live engine, or advancing any counter.

## Authenticated API

Use existing session-token authentication and ownership verification; shared-request tokens must not configure DNS. Add these routes under `/api/v2/dns/rebinding`:

- `GET`: retrieve configuration, generation, runtime status, and capacity information.
- `PUT`: validate and atomically replace the session's complete profile collection; return the canonical saved configuration and generation.
- `POST /:profile_id/reset`: reset a single profile.
- `POST /:profile_id/phase`: select a manual phase by stable phase ID; reject this action for other strategies.
- `POST /preview`: validate and evaluate a draft profile with hypothetical context; never mutate live state.

Use structured validation errors with field paths, authentication failures consistent with existing APIs, and explicit capacity errors. Reject invalid updates before altering the current configuration. Include generation preconditions on mutations so stale editor tabs receive a conflict response instead of overwriting newer work. Each accepted configuration replacement, reset, or manual phase selection increments the session generation and returns the new generation; DNS queries and read-only status requests do not change it.

Add optional rebinding metadata to DNS log entries: profile ID/name, generation, phase ID/index, strategy, state scope, query index where applicable, and capacity or suppression status. Multiple-address mode records the contributing phase IDs instead of claiming one phase was selected. Existing request viewers and exports continue accepting logs without these fields. Profile status refreshes every two seconds only while the DNS rebinding view is active; request history uses the existing capture stream.

## Configuration UI

Extend `DnsSettingsPage` with Records and Rebinding views using KebabReq's existing typography, colors, form components, and responsive layout. Profile controls include create, rename, enable, delete, and strategy selection. The hostname field shows the full resolved hostname and exact/wildcard precedence.

Replace the mockup's two fixed IP inputs with an ordered phase editor. Users can add, remove, and move phases up/down, choose any manual phase, and add/remove addresses within a phase. Every phase exposes its applicable TTL, count, duration, or weight. Bulk paste accepts newline/comma-separated addresses and creates individual phases, with a separate choice to place them in a single answer set. Preserve input order and report invalid addresses inline. Advanced controls expose family behavior, scope, negative TTL, and hold/repeat behavior.

Provide presets for count-based public-to-loopback switching, timed switching, N-address rotation, weighted selection, and multiple-answer experiments. Presets populate editable configuration, never apply it silently. The public initial address for the req deployment is `79.76.62.80`; all addresses remain editable.

Show a draft answer preview, phase sequence, live counters, last served phase, and actual DNS history. Distinguish draft simulation from applied configuration and actual traffic. Offer copyable hostname and authoritative `dig` commands. Simulation uses the full list; it does not display only the first and last destination. Saving, conflicts, errors, reset behavior, and restart volatility must be explicit. Export/import uses versioned JSON with no session tokens or passwords.

Support keyboard editing and labeled controls. Phase reorder buttons provide a keyboard-accessible alternative to drag interaction. At narrow widths, stack fields without clipping address values or actions. Retain unsaved drafts when background status refreshes; on session changes, load that session's own draft/configuration without leaking the previous session's state.

## Verification and deployment

Test strategy behavior with an injected clock and random sample source. Cover 1, 2, 3, and many phases; phase answer sets; exact count and duration boundaries; hold/repeat; zero weights; IPv6; CNAME replies to address questions; RRset TTL consistency; validation; and side-effect-free previews.

Exercise actual serialized DNS responses over UDP and TCP, including oversized multi-address answers, truncation without counter consumption, concurrent requests, independent query types and scopes, configuration changes during traffic, capacity exhaustion, and session release. API checks cover ownership, invalid atomic updates, stale generations, and reset/manual selection. Preserve existing static DNS and certificate behavior.

Frontend checks cover bulk entry, list reordering, more than two addresses, strategy-specific controls, save/error/conflict handling, import/export, preview isolation, and session switching. Run existing Rust and frontend checks plus responsive browser verification of the integrated UI.

After verification, commit and push the source, update the req Dockerfile's source commit and archive checksum, and deploy using `havet deploy req`. Verify health, authenticated UI, static DNS, and rebinding UDP/TCP responses with a temporary session. A redeploy restarts the service and clears existing in-memory captures and DNS settings; report this limitation before deployment. Do not modify the shared proxy or other production applications. Rollback consists of restoring the prior source pin/checksum and redeploying req.

## Scope boundary

This feature configures authoritative DNS and existing HTTP callback responses for CTF experiments. It does not promise to bypass resolver rebinding protection, client DNS caching, browser connection reuse, HTTPS certificate checks, or browser network restrictions. Negative-answer TTL behavior follows [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308.html). No new public DNS delegation, external service, secret, or persistent database is required.
