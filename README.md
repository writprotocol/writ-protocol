# Writ Protocol

A structured delegation protocol for autonomous AI agents. When an AI pushes
the button, a writ proves a human said yes.

This repo is the v0.1 reference implementation: TypeScript packages for the
core wire format, a stateful engine, and an MCP harness — plus the two
foundational documents that define the protocol.

## Read first

1. **[Concept & Architecture](docs/writ-protocol-concept-v0_1.md)** — vision,
   problem framing, the five primitives (Writ, Token, Receipt, Amendment,
   Registry), delegation model, prior art.
2. **[Specification v0.1](docs/writ-protocol-spec-v1.md)** — wire format:
   schema, signing (Ed25519 over RFC 8785 canonical JSON), namespacing,
   validation rules, worked example.

## Packages

| Package | Purpose |
|---|---|
| `@writprotocol/core` | Schema types, RFC 8785 canonicalization, Ed25519 sign/verify, structural validator |
| `@writprotocol/engine` | Stateful runtime: load writ, gate actions, record + sign receipts, publish to a registry |
| `@writprotocol/mcp` | A Model Context Protocol server exposing the engine's gated actions as agent tools |

The package layout matches the spec's vocabulary. Adapters for specific agent
frameworks (`@writprotocol/langchain`, etc.) and a CLI surface are sketched in
the concept paper as v0.2+ work.

## Status

- v0.1 wire format (`protocol: "writ/v0"`) — stable for the v0 cycle; will
  promote to `writ/v1` at protocol stabilization.
- 75 tests, build and typecheck clean.
- Five `core.*` actions (`file.read`, `browser.navigate`, `form.fill`,
  `form.submit`, `browser.screenshot`) implemented as the starter set; the
  full vocabulary will grow as concrete use cases require it.

What the spec defers to a later revision (tokens as a wire artifact, full
amendment schema, validator dispatch for non-`core.*` namespaces, per-action
signing, registry-level identity/key publishing) is named explicitly so it
doesn't masquerade as "shipped." See the spec's *What v1 Does Not Include*
section.

## Build

```sh
npm install
npm run build
npm test
```

Requires Node ≥ 20.

## License

MIT — see [LICENSE](LICENSE).
