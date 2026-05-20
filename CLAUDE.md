# Writ Protocol — Reference Implementation

The v0.1 reference implementation of Writ Protocol: TypeScript packages for the
core schema, the engine, and an MCP harness.

## Read first (in order, before any code)

1. `docs/writ-protocol-concept-v0_1.md` — vision, problem framing, primitives, architecture, prior art
2. `docs/writ-protocol-spec-v1.md` — v0.1 wire format: writs, receipts, signing, namespacing, worked example

Locked decisions live in those docs. Do not re-litigate them without explicit user agreement.

## Stack (locked)

- **Language:** TypeScript. Packages aligned with the spec's vocabulary: `@writprotocol/core`, `@writprotocol/engine`, `@writprotocol/cli`, `@writprotocol/sdk`, `@writprotocol/mcp`.
- **Crypto:** `@noble/ed25519` for signing, `canonicalize` (Anders Rundgren's npm package, RFC 8785 author) for JCS canonicalization.
- **Browser harness:** lynx via `child_process` for fetching and final-page text dumps. The harness (Node) holds form state in memory and constructs/POSTs the multipart submission itself. lynx is **not** driven interactively via stdin.
- **Registry:** static files on `registry.writprotocol.dev` via Cloudflare Pages, sourced from a private GitHub repo. The engine publishes by `git push` to a registry repo checkout; Cloudflare Pages redeploys on push. The public org landing lives at `writprotocol.dev`, also on Cloudflare Pages.

## Out of scope for v0.1 (explicitly deferred — do not drift back in)

- Token artifact as wire format (engine-internal counters only; `token_consumed: bool` on receipts is the surface)
- Amendment objects (writs run at revision 1)
- Per-action signing (receipt-level signature only)
- Delegation tree / child writs (single agent, single writ)
- Full `core.*` action vocabulary beyond the five in the worked example (`file.read`, `browser.navigate`, `form.fill`, `form.submit`, `browser.screenshot`)
- Templates, framework adapters, dashboard UI

## Working style

- **Own the gap.** The concept paper is the north star; the spec is the v0.1 reference. Things in the concept that the spec defers are *known gaps* — frame them honestly, don't pretend they're built. When proposing scope, default to "ship the MVP honestly, defer with explicit framing" over "make v0.1 complete."
- **Framing changes are often the highest-leverage move**, more so than implementation. Suggest those first when applicable.
- **Read-confirm-ask-then-code.** When picking up new work, read the relevant docs, confirm understanding, ask any blocking questions, *then* write code. Do not improvise past locked decisions.
- **No new abstractions or features beyond the immediate need.** Over-engineering is the biggest non-external risk.

## Status

Engine, harness, and the MCP server are complete; 75 tests pass clean.

- **core, engine, mcp** — `core.file.read` `paths` accepts `string | {path, content_hash?}` for per-file integrity binding; check returns raw bytes (`Uint8Array`). Strict ISO 8601 datetime validation via the Temporal polyfill. Signed-writ verification on `loadWrit`. Fail-closed constraint gates. `form_fill` is a single batch call; `form_submit` reads attachments through gated `core.file.read` and appends them as multipart blobs; in dryrun mode the POST is recorded but not sent. Stdin-close finalize.
- **Disclosure** is reserved as a v0 protocol concept and exposed via a `get_disclosure` MCP tool that composes a templated narrative with `{{writ_url}}` and `{{receipt_url}}` substituted from the run. The template lives outside the writ in v0; a future revision will lift it to `writ.disclosure_template` + `receipt.disclosures[]` (reserved in the spec).
- **Registry infrastructure** — the engine publishes signed artifacts to a git-checkout-as-registry; reference deployments serve those files via static hosting. Non-discoverability holds: no directory listings; no `/keys/` endpoint in v0. Cross-issuer key verification flows through `issued_by.identities[]`, not a registry key file.

## Pre-existing memory

The user's prior memory directory (`~/.claude/projects/-Users-ilkka/memory/`) contains context built up during the design phase. Claude Code memory is per-working-directory, so it does not auto-load here. The concept and spec docs are sufficient context; treat them as the source of truth.
