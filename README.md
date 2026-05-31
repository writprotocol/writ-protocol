<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://writprotocol.dev/writ-W-paper.svg">
    <img alt="Writ Protocol" src="https://writprotocol.dev/writ-W-ink.svg" width="120">
  </picture>
</p>

# Writ Protocol

A structured delegation-and-evidence protocol for autonomous AI agents.
When an AI pushes the button, a writ proves a human said yes.

This repo is the v0.1 reference implementation: TypeScript packages for
the core wire format, a stateful engine, and a Model Context Protocol
harness — plus the two foundational documents that define the protocol.

## Read first

1. **[Concept & Architecture](docs/writ-protocol-concept-v0_1.md)** —
   vision, problem framing, the five primitives (Writ, Token, Receipt,
   Amendment, Registry), delegation model, prior art.
2. **[Specification v0.1](docs/writ-protocol-spec-v1.md)** — wire format:
   schema, signing (Ed25519 over RFC 8785 canonical JSON), namespacing,
   validation rules, a fully worked example, and *What v1 Does Not
   Include*.

## Packages

| Package | Purpose |
|---|---|
| `@writprotocol/core` | Schema types, RFC 8785 canonicalization, Ed25519 sign/verify, structural validator |
| `@writprotocol/engine` | Stateful runtime: load a writ, gate actions, record + sign receipts, publish to a registry |
| `@writprotocol/mcp` | Model Context Protocol server exposing the engine's gated actions as agent tools |

The package layout matches the spec's vocabulary. Adapters for specific
agent frameworks (`@writprotocol/langchain`, etc.) and a CLI surface are
on the roadmap.

## Status

- v0.1 wire format (`protocol: "writ/v0"`) — stable for the v0 cycle;
  will promote to `writ/v1` at protocol stabilization.
- **75 tests green**, build and typecheck clean.
- Five `core.*` actions implemented as the starter set: `file.read`,
  `browser.navigate`, `form.fill`, `form.submit`, `browser.screenshot`.
  Each action namespace owns its constraint-filter shape and receipt
  detail shape per the spec.
- What's deferred to a later revision (tokens as a wire artifact, full
  amendment schema, validator dispatch for non-`core.*` namespaces,
  per-action signing, deeper disclosure-content validation) is named
  explicitly in the spec so nothing masquerades as "shipped."

## Live artifacts

A canonical example pair is publicly resolvable from the registry:

- **Writ** — [`registry.writprotocol.dev/writ/writ_example01.json`](https://registry.writprotocol.dev/writ/writ_example01.json) — scope of three `core.*` actions, `example.org` constraints, signed by the demo issuer key.
- **Receipt** — [`registry.writprotocol.dev/receipt/receipt_example01.json`](https://registry.writprotocol.dev/receipt/receipt_example01.json) — three recorded actions, full reversibility rollup, signed by the engine.

Re-generatable via [`scripts/build-example.mjs`](scripts/build-example.mjs).

## Verify locally

Verification is RFC 8785 canonical JSON + Ed25519 against a published
public key. Five lines with `@writprotocol/core`:

```ts
import { validateWrit, validateReceipt, validateReceiptAgainstWrit, verify } from "@writprotocol/core";

const writ    = await (await fetch("https://registry.writprotocol.dev/writ/writ_example01.json")).json();
const receipt = await (await fetch("https://registry.writprotocol.dev/receipt/receipt_example01.json")).json();

console.log("writ:",       validateWrit(writ).valid,                       await verify(writ,    writ.issued_by.key));
console.log("receipt:",    validateReceipt(receipt).valid,                 await verify(receipt, receipt.produced_by.key));
console.log("cross-ref:",  validateReceiptAgainstWrit(receipt, writ).valid);
```

All `valid: true, sig: true`. There's nothing protocol-specific about
verification — any Ed25519 + canonical-JSON implementation reproduces
it.

## Build

```sh
npm install
npm run build
npm test
```

Requires Node ≥ 20.

## AI assistance

This codebase was developed with substantial AI coding assistance. To
follow public-interest transparency norms around generative AI in
open-source projects, the model, the workflow, and the per-commit
attribution are all disclosed here.

**Tools and models.**
- **Claude (Opus 4.7, 1M-context)** by Anthropic, driven through Claude
  Code, was the primary coding assistant. It drafted most of the
  TypeScript implementation, the test suites, the build and generation
  scripts, and a substantial share of the prose in `docs/`.
- **OpenAI Codex** was used as an independent adversarial review pass
  on uncommitted changes before each substantive commit. Findings from
  that pass were addressed or explicitly accepted as deferred before
  the change landed.

**Division of work.**
- The protocol design, the v0.1 specification, scope cuts, and final
  judgments on every change are by the author.
- The AI assistants generated and revised implementation, tests, scripts,
  and documentation prose under the author's direction.

**Per-commit provenance.** AI-assisted commits carry a `Co-Authored-By:
Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer. The model
and context window are explicit in `git log`. Each commit message's body
summarises the change, which is also a summary of what was requested for
that change — making the "how it was used" question answerable per-commit
without separate logs.

**Development transcripts.** The full conversation transcripts between
the author and the coding assistant are preserved locally with the
project (one session per file under
`~/.claude/projects/<workspace>/<session>.jsonl`). They can be published
or shared on request — relevant if anyone wants to verify the prompt
context for a specific change beyond what the commit message captures.

## License

MIT — see [LICENSE](LICENSE).
