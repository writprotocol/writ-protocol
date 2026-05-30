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

The project dogfoods its own protocol. A signed writ + receipt pair from
integration testing is publicly resolvable:

- **Writ** — [`registry.writprotocol.dev/writ/writ_s9cgwkeb2o.json`](https://registry.writprotocol.dev/writ/writ_s9cgwkeb2o.json) — declares scope (five `core.*` actions), constraints (content-hashed file reads, target domain, single submission), and the issuer's signing key.
- **Receipt** — [`registry.writprotocol.dev/receipt/receipt_4y3jxubjfa.json`](https://registry.writprotocol.dev/receipt/receipt_4y3jxubjfa.json) — records the full action sequence, the constructed POST body, and the engine's signature.

Both are `mode: "dryrun"` (produced against a real target form without
sending the submission). The receipt's action log shows exactly what the
agent did under what writ authorized them.

## Verify locally

Verification is RFC 8785 canonical JSON + Ed25519 against a published
public key. Four lines with `@writprotocol/core`:

```ts
import { validateWrit, validateReceipt, verify } from "@writprotocol/core";

const writ    = await (await fetch("https://registry.writprotocol.dev/writ/writ_s9cgwkeb2o.json")).json();
const receipt = await (await fetch("https://registry.writprotocol.dev/receipt/receipt_4y3jxubjfa.json")).json();

console.log("writ:",    validateWrit(writ).valid,    await verify(writ,    writ.issued_by.key));
console.log("receipt:", validateReceipt(receipt).valid, await verify(receipt, receipt.produced_by.key));
```

Both `valid: true, sig: true`. There's nothing protocol-specific about
verification — any Ed25519 + canonical-JSON implementation reproduces
it.

## Build

```sh
npm install
npm run build
npm test
```

Requires Node ≥ 20.

## License

MIT — see [LICENSE](LICENSE).
