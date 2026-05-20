# Writ Protocol — Schema Specification v1

> **Status:** Implementation reference. Captures the design decisions for the v1 schema as agreed in concept work. Companion to `writ-protocol-concept-v0_1.md`, which holds the higher-level positioning and architecture.
> **Author:** Ilkka
> **Date:** May 2026

---

## Purpose and Scope

This document specifies the v1 wire format for Writ Protocol. It defines the shape of writs, receipts, and supporting structures; the namespacing rules; the signing conventions; and the validation rules that apply across the protocol.

It does not specify engine implementation, CLI commands, registry protocol, or framework adapters. Those are downstream concerns. The wire format is the contract.

The v1 spec is deliberately tight. Token schema, amendment schema detail, validator interfaces for external namespaces, and per-action signing semantics are reserved for later versions. Where v1 leaves a forward-compatible reservation, this document notes it.

---

## Core Principles

The protocol commits to a small set of principles that govern every decision in the schema.

**Authority is engine-agnostic.** A writ defines what was authorized. The engine that enforces it is downstream. Multiple engines can consume the same writ format; their enforcement strategies and extension surfaces are their own business. The writ does not declare which engine enforces it. Engine identity lives on the receipt, where it belongs as a property of execution and witnessing.

**Conservation of authority.** Authority enters the system only through a human issuing a writ. It can be divided, attenuated, and consumed, but never created from nothing. Child writs cannot exceed their parent's scope. Token operations are atomic and conserved.

**Static vs. dynamic information is separated.** Properties of actions (what they do, whether they are reversible) belong to the action's namespace and are stable across executions. Properties of execution (what an engine did, what an engine claims it can undo) belong on the receipt and are dynamic.

**Extensions are non-authoritative.** The set of authorized actions, the constraints on those actions, and the lifecycle of the writ are defined solely by the core spec. Extensions can carry metadata, observations, audit information, or compatibility shims, but cannot grant, restrict, or modify authority.

**Honesty over completeness.** Receipts record what happened — including blocked attempts, declined amendment requests, and limitations of engine capability. The protocol prefers explicit absence over silent omission.

---

## Namespacing

Every action and every extension carries a namespace. The namespace is the leftmost dot-separated segment of the identifier.

### Action identifiers

Actions are namespaced with three or more segments: `<namespace>.<resource>.<action>`.

Examples: `core.file.read`, `core.form.submit`, `core.browser.navigate`. The leftmost segment is the namespace. The remaining segments describe the resource and operation in a convention defined by that namespace. The action namespace owns the filter shape used in constraints for that action and the detail shape used in receipt entries.

In v1, all actions are in the `core` namespace. External namespaces become possible from v1 by structural design, but no external action vocabulary is defined or expected to ship with v1.

### Extension identifiers

Extensions use two-or-more-segment namespaced identifiers: `<namespace>.<identifier>`.

Examples: `sanna.audit`, `acme_corp.tracking`, `core.beta_preview`. The leftmost segment is the namespace. Extensions can appear at the writ level, at the receipt level, inside any constraint object, and inside any action entry. The same namespacing rules apply at every level.

### Reserved names

The following names are reserved at the namespace level and cannot be claimed by external implementations: `core`, `writ`, `token`, `receipt`, `amendment`, `registry`, `protocol`, `extensions`, `id`, `signature`.

`core` is the active spec namespace. The remainder are reserved against future need.

### Validator dispatch (deferred)

A future version of the spec will define how engines dispatch validation of namespaced fields to namespace-specific validators. In v1, engines handle `core.*` natively and treat unknown namespaces as opaque data: validated for structural correctness (the namespace key pattern), passed through without semantic checking.

---

## The `protocol` field

Every primitive carries a `protocol` field at the top level. Its value is the literal string `"writ/v0"` during the pre-release build phase, and is promoted to `"writ/v1"` when the protocol stabilizes. This is the version identifier and is required on every writ, receipt, and any other primitive defined by the spec.

---

## Identity and Signing

### Principals

A principal is the entity issuing or witnessing an artifact. The schema:

```json
{
  "handle": "@ilkka",
  "identities": [
    {
      "type": "email",
      "value": "ilkka@writprotocol.dev",
      "attestation": { "method": "self" }
    }
  ],
  "key": "ed25519:base64encodedpublickey"
}
```

The `handle` is a display name, cosmetic, not used for verification. Any string is permitted; issuers SHOULD prefix the handle with `@` (e.g. `@ilkka`) as a convention for visual disambiguation, but bare strings are also valid. The `identities` array carries identity claims of various types (`email`, `github`, `oidc`, `saml`, `url`). Each identity can optionally include an `attestation` object whose `method` discriminates how the identity was verified. When omitted, attestation defaults to `self` — the principal vouches for themselves.

The `key` is the cryptographic public key in the format `<algorithm>:<base64-encoded-key>`. v1 supports `ed25519` only.

The protocol does not verify identities. It records who claims to have done what, signed by a key. Identity verification is downstream (a registry, an OIDC provider, a SAML federation) and lives in the attestation method when present.

### Signatures

Signatures use Ed25519 over the RFC 8785 canonical JSON representation of the artifact with the `signature` field omitted. The schema:

```json
{
  "algorithm": "ed25519",
  "value": "base64-encoded-signature",
  "signed_at": "2026-05-28T14:32:00Z"
}
```

Signing is optional in v1 — the schema permits unsigned writs and receipts. External-facing artifacts (writs intended for public registries, receipts produced for verifiable disclosure) should be signed. Local-only single-machine demos can elide signing.

The choice is per-issuance. The schema does not enforce signing; engines and registries can require it as policy.

---

## Writ Schema

A writ is a task-scoped delegation of authority from a human principal to an agent.

### Required fields

| Field | Type | Description |
|---|---|---|
| `protocol` | `"writ/v0"` | Version identifier. |
| `id` | string, pattern `^writ_[a-z0-9]{6,}$` | Stable identifier. |
| `mode` | `"live" \| "dryrun"` | Execution mode authorized by this writ. Immutable. |
| `issued_by` | Principal | Who issued the writ. For root writs, a human; for child writs, an agent under a parent writ. |
| `delegate` | object | The agent receiving this writ. See below. |
| `task` | string | Human-readable description of the task. |
| `scope` | array of action identifiers | Set of namespaced actions authorized. Minimum one entry. |
| `issued_at` | ISO 8601 datetime | When the writ was issued. |
| `expires_at` | ISO 8601 datetime | When the writ expires. All tokens under the writ become invalid at this time. |
| `status` | enum | `issued \| active \| amended \| completed \| expired \| revoked`. |
| `revision` | integer ≥ 1 | Revision number. Starts at 1. Incremented by each amendment. |

### Optional fields

| Field | Type | Description |
|---|---|---|
| `parent` | writ id | If this is a child writ, the ID of the parent. Child scope must be a subset of parent scope. |
| `intent` | string | Commander's intent. Non-enforced free-text guidance about purpose. Translation key for cases the structured scope and constraints cannot fully capture. |
| `constraints` | object | Per-action filter sets. See below. |
| `amendments` | array of amendment ids | Ordered list of amendments applied, oldest first. |
| `template` | object | Reference to the template this writ was instantiated from. Informational. |
| `signature` | Signature | Cryptographic signature by the issuer. |
| `extensions` | object | Non-authoritative metadata, namespaced. |

### The `delegate` field

```json
{
  "type": "agent",
  "id": "agent:claude-code",
  "description": "Claude Code, terminal-native coding agent (Anthropic)"
}
```

The `type` is `"agent"` in v1. The `id` follows the convention `agent:<name>`. The `description` is optional and human-readable.

### The `scope` field

An array of namespaced action identifiers, each matching the pattern `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$` — minimum three dot-separated segments. Entries must be unique. Minimum one entry.

Wildcards are not supported in v1. Each authorized action must be enumerated explicitly.

### The `constraints` field

A map from action identifier to a per-action filter object. The action identifier must appear in `scope`. The shape of the filter object's contents is defined by the action's namespace.

A reserved key `extensions` is permitted inside any constraint object for cross-namespace annotation.

```json
"constraints": {
  "core.form.submit": {
    "domains": ["example.org"],
    "max_submissions": 1,
    "extensions": {
      "sanna.enforcement": { "rule_id": "submission_rate_limit_v3" }
    }
  }
}
```

### The `extensions` field

A map from namespaced extension identifier to an opaque object. Keys match the pattern `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]+$`. Values are opaque to the core spec.

### Lifecycle and state transitions

```
issued → active → amended → completed | expired | revoked
                ↓
                completed | expired | revoked
```

`issued` is the brief state between issuance and first execution. `active` is the operational state. `amended` is a transient annotation that the writ has been amended; engines may treat it as equivalent to `active` for operational purposes while preserving it in the audit trail. `completed`, `expired`, and `revoked` are terminal states.

Engines enforce these transitions. Clients observe them.

### Conservation of authority (delegation)

When an agent under a writ issues a child writ to a sub-agent, the child writ:

- Has the agent as its `issued_by` (not the original human)
- Has the original writ's id as `parent`
- Has scope that is a subset of the parent's scope
- Has constraints at least as tight as the parent's constraints

Tokens are moved (not copied) from parent to child. The engine validates and performs token movements atomically. Authority is conserved across the operation: total authorized capacity in the parent + child after movement equals the parent's capacity before.

Revocation of a parent writ revokes all child writs and their tokens transitively.

---

## Receipt Schema

A receipt is the engine's record of execution under a writ.

### Required fields

| Field | Type | Description |
|---|---|---|
| `protocol` | `"writ/v0"` | Version identifier. |
| `id` | string, pattern `^receipt_[a-z0-9]{6,}$` | Stable identifier. |
| `writ` | object | Reference to the writ executed. See below. |
| `produced_by` | object | The engine that produced this receipt. See below. |
| `delegate` | string | The agent identifier that executed under the writ. |
| `started_at` | ISO 8601 datetime | When execution began. |
| `completed_at` | ISO 8601 datetime | When execution ended. Required unless `status` is `pending` (a reserved placeholder receipt). |
| `status` | enum | `pending \| completed \| failed \| terminated \| dryrun_completed`. |
| `actions` | array | The action log. Required, may be empty. |
| `delegations` | array | References to child writs/receipts produced during execution. Required, may be empty. |
| `amendments_applied` | array | Amendments applied during execution. Required, may be empty. |
| `amendments_requested` | array | Amendment requests including those declined. Required, may be empty. |
| `reversibility` | object | Rollup of reversibility properties. See below. |

### Optional fields

| Field | Type | Description |
|---|---|---|
| `signature` | Signature | Engine's signature over the canonical receipt. |
| `extensions` | object | Non-authoritative metadata, namespaced. |

### Reserved receipts (`pending`)

An engine may reserve a receipt's identifier and registry address before execution finishes, by publishing a placeholder receipt with `status: "pending"`. A pending receipt carries the fields known at run start — `id`, `writ`, `produced_by`, `delegate`, `started_at` — with an empty `actions` log; `completed_at` is absent until the run finalizes, at which point the placeholder is overwritten by the final receipt. Reservation is optional: a run may publish only its final receipt. `pending` is the one non-terminal receipt status.

### The `writ` reference

```json
{
  "id": "writ_nl5k2c",
  "mode": "live",
  "revision": 1
}
```

The mode is carried on the receipt for self-description: a receipt's mode must match the writ's mode at the revision it was executed against. Engines reject any execution that would produce a mode mismatch.

The revision is the writ's revision at completion time. If amendments were applied during execution, this is the final revision; the `amendments_applied` array records the path.

### The `produced_by` field

```json
{
  "engine": "core.writprotocol-engine",
  "version": "0.1.0",
  "key": "ed25519:base64encodedpublickey"
}
```

The `engine` identifier is namespaced — the reference implementation is `core.writprotocol-engine`. Alternative engines use their own namespace.

The `key` is the engine's signing key. The receipt's top-level signature, when present, verifies against this key.

### Action entry shape

Each entry in the `actions` array:

| Field | Type | Required | Description |
|---|---|---|---|
| `sequence` | integer ≥ 1 | yes | Ordering within this receipt. |
| `action` | namespaced action id | yes | Must appear in the writ's scope. |
| `timestamp` | ISO 8601 datetime | yes | When the action was attempted. |
| `result` | `success \| failure \| blocked` | yes | Outcome. |
| `target` | string | conditional | The target of the action (path, URL, email id). Required when meaningful for the action; the action's namespace defines whether and how. |
| `details` | object | optional | Action-specific structured detail. Shape defined by the action's namespace. |
| `block_reason` | object | conditional | Required when `result: blocked`. See below. |
| `token_consumed` | boolean | yes | Whether a token was consumed by this attempt. |
| `irreversible` | boolean | yes | Whether the action is reversible in principle. Property of the action, set by its namespace. |
| `undo_available` | boolean | yes | Whether the producing engine can undo this action if asked. Engine claim. |
| `undo_unavailable_reason` | enum | conditional | When `irreversible: false` and `undo_available: false`. Allowed values: `undo_window_expired`, `engine_does_not_support`, `external_coordination_required`, `state_lost`. |
| `user_feedback` | object | yes | Progressive trust fields. See below. v1 engines write null. |
| `signature` | Signature \| null | yes (nullable) | Per-action signature by the consuming token. v1 implementations may leave null; v2+ may require. |
| `extensions` | object | optional | Per-action namespaced metadata. |

#### Constraint between `irreversible` and `undo_available`

If `irreversible: true`, then `undo_available` must be `false`. The reverse does not hold: an action with `irreversible: false` may have either value for `undo_available`. When `irreversible: false` and `undo_available: false`, the `undo_unavailable_reason` field may be populated to explain why.

#### The `block_reason` object

```json
{
  "rule": "scope_violation",
  "detail": "core.calendar.create not in writ scope"
}
```

`rule` is an enum: `scope_violation`, `constraint_violation`, `token_exhausted`, `writ_expired`, `writ_revoked`. `detail` is human-readable elaboration.

Blocked actions still appear in the action log and still get signed (when per-action signing is enabled). The signature attests to the attempt and its block, locking the evidence against silent omission.

#### The `user_feedback` object

```json
{
  "confirmed": null,
  "undone": null,
  "corrected": null,
  "feedback_at": null
}
```

Reserved for progressive trust features. v1 engines write null for all fields. Future versions will define semantics for population and updating.

### The `delegations` array

Each entry references a child writ and the receipt produced for it:

```json
{
  "child_writ": "writ_8b2c1d",
  "child_receipt": "receipt_3a9f0c",
  "delegate": "agent:email-categorizer"
}
```

The parent receipt does not embed the child receipt's content. Verifiers walk the tree by fetching child receipts as needed.

### The `amendments_applied` array

References amendments that successfully changed the writ during execution:

```json
{
  "amendment_id": "amendment_2d7c3b",
  "revision": "1 → 2",
  "applied_at": "2026-05-28T14:34:55Z"
}
```

### The `amendments_requested` array

Records amendment requests, including those declined. Declined requests do not produce an amendment object but are still evidence:

```json
{
  "requested_at": "2026-05-28T14:34:30Z",
  "scope_requested": ["core.email.send"],
  "reason": "agent wanted to confirm submission via email",
  "decision": "declined",
  "decided_at": "2026-05-28T14:34:55Z"
}
```

Approved requests reference the resulting amendment via `decision: "approved"` and an `amendment_id` field.

### The `reversibility` rollup

```json
{
  "contains_irreversible": true,
  "all_reversible": false
}
```

A point-in-time summary across the actions. `contains_irreversible` is true if any action has `irreversible: true`. `all_reversible` is true if every action has `irreversible: false`. The rollup does not include engine undo state — that is per-action and dynamic.

---

## Worked Example: Form Submission

The following pair of artifacts represents a real intended use case: submitting an application form via Claude Code, with the writ and receipt published to a minimal registry and disclosed in the application's GenAI field.

### The writ

```json
{
  "protocol": "writ/v0",
  "id": "writ_nl5k2c",
  "mode": "live",
  "issued_by": {
    "handle": "@ilkka",
    "identities": [
      {
        "type": "email",
        "value": "ilkka@writprotocol.dev",
        "attestation": { "method": "self" }
      }
    ],
    "key": "ed25519:MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8="
  },
  "delegate": {
    "type": "agent",
    "id": "agent:claude-code",
    "description": "Claude Code, terminal-native coding agent (Anthropic)"
  },
  "task": "Submit the example application.",
  "intent": "Fill and submit the example form exactly as drafted, including the GenAI disclosure naming this writ. Do not edit application content. Do not submit twice. If the form requires fields not covered by the prepared content, stop and ask. The submission is the only outward action authorized.",
  "scope": [
    "core.file.read",
    "core.browser.navigate",
    "core.form.fill",
    "core.form.submit",
    "core.browser.screenshot"
  ],
  "constraints": {
    "core.file.read": {
      "paths": [
        {
          "path": "/Users/ilkka/writ-protocol/application.md",
          "content_hash": "sha256:7a8f3b2e9c1d4f6a8b5c0e2f4d6a8b3c5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b"
        }
      ]
    },
    "core.browser.navigate": {
      "domains": ["example.org"]
    },
    "core.form.fill": {
      "domains": ["example.org"]
    },
    "core.form.submit": {
      "domains": ["example.org"],
      "max_submissions": 1
    },
    "core.browser.screenshot": {
      "domains": ["example.org"]
    }
  },
  "issued_at": "2026-05-28T14:32:00Z",
  "expires_at": "2026-05-28T15:32:00Z",
  "status": "active",
  "revision": 1,
  "amendments": [],
  "extensions": {},
  "signature": {
    "algorithm": "ed25519",
    "value": "kT2j8nL5pQ7rS3vW4xY6zA1bC9dE0fG2hI4jK5mN6oP8qR1sT3uV5wX7yZ9aB0cD2eF4gH6iJ8kL0mN2oP4qR6sT8uV0wX2yZ4aB6cD8eF0gH2iJ4kL6mN8oP0qR==",
    "signed_at": "2026-05-28T14:32:00Z"
  }
}
```

### The receipt

```json
{
  "protocol": "writ/v0",
  "id": "receipt_4k9m2p",
  "writ": {
    "id": "writ_nl5k2c",
    "mode": "live",
    "revision": 1
  },
  "produced_by": {
    "engine": "core.writprotocol-engine",
    "version": "0.1.0",
    "key": "ed25519:enginekeybase64=="
  },
  "delegate": "agent:claude-code",
  "started_at": "2026-05-28T14:33:12Z",
  "completed_at": "2026-05-28T14:38:47Z",
  "status": "completed",
  "actions": [
    {
      "sequence": 1,
      "action": "core.file.read",
      "timestamp": "2026-05-28T14:33:14Z",
      "result": "success",
      "target": "/Users/ilkka/writ-protocol/application.md",
      "details": {
        "bytes_read": 18432,
        "content_hash_verified": true
      },
      "token_consumed": false,
      "irreversible": false,
      "undo_available": false,
      "undo_unavailable_reason": "engine_does_not_support",
      "user_feedback": {
        "confirmed": null,
        "undone": null,
        "corrected": null,
        "feedback_at": null
      },
      "signature": null,
      "extensions": {}
    },
    {
      "sequence": 2,
      "action": "core.browser.navigate",
      "timestamp": "2026-05-28T14:33:28Z",
      "result": "success",
      "target": "https://example.org/propose/",
      "token_consumed": false,
      "irreversible": false,
      "undo_available": true,
      "user_feedback": {
        "confirmed": null,
        "undone": null,
        "corrected": null,
        "feedback_at": null
      },
      "signature": null,
      "extensions": {}
    },
    {
      "sequence": 3,
      "action": "core.form.fill",
      "timestamp": "2026-05-28T14:35:02Z",
      "result": "success",
      "target": "https://example.org/propose/",
      "details": {
        "fields_filled": 14,
        "genai_disclosure_field": "writ_nl5k2c"
      },
      "token_consumed": false,
      "irreversible": false,
      "undo_available": true,
      "user_feedback": {
        "confirmed": null,
        "undone": null,
        "corrected": null,
        "feedback_at": null
      },
      "signature": null,
      "extensions": {}
    },
    {
      "sequence": 4,
      "action": "core.form.submit",
      "timestamp": "2026-05-28T14:38:21Z",
      "result": "success",
      "target": "https://example.org/propose/",
      "token_consumed": true,
      "irreversible": true,
      "undo_available": false,
      "user_feedback": {
        "confirmed": null,
        "undone": null,
        "corrected": null,
        "feedback_at": null
      },
      "signature": null,
      "extensions": {}
    },
    {
      "sequence": 5,
      "action": "core.browser.screenshot",
      "timestamp": "2026-05-28T14:38:42Z",
      "result": "success",
      "target": "https://example.org/propose/confirmation",
      "details": {
        "saved_to": "/Users/ilkka/writ-protocol/submission-confirmation.png"
      },
      "token_consumed": false,
      "irreversible": false,
      "undo_available": false,
      "undo_unavailable_reason": "engine_does_not_support",
      "user_feedback": {
        "confirmed": null,
        "undone": null,
        "corrected": null,
        "feedback_at": null
      },
      "signature": null,
      "extensions": {}
    }
  ],
  "delegations": [],
  "amendments_applied": [],
  "amendments_requested": [],
  "reversibility": {
    "contains_irreversible": true,
    "all_reversible": false
  },
  "extensions": {},
  "signature": {
    "algorithm": "ed25519",
    "value": "rW8x4yL9pM2nQ5sV6tU0bC3dF7eG1hJ4kK6mO9pR2sT5vX8yZ1aB4cE7fH0iJ3kL6mN9oP2qR5sT8uW1xY4zA7bD0eF3gH6iJ9kL2mN5oP8qR1sT4uV7wX0yZ3aB==",
    "signed_at": "2026-05-28T14:38:47Z"
  }
}
```

### Notes on this example

The `content_hash` constraint on `core.file.read` binds the writ to a specific version of the application content. Claude Code cannot edit the application before submitting; if the file is modified, the writ becomes invalid against it. This is the strongest protection available at the protocol level against silent agent modification of the artifact being submitted.

The `genai_disclosure_field` detail records the recursive disclosure: the writ ID is filled into the form by the agent acting under that writ. Self-referential and stable, because the writ ID is known at issuance time before submission.

`undo_available` is `false` for the file read and the screenshot because the reference engine does not maintain undo state for these action types, even though both are reversible in principle. The `undo_unavailable_reason` field makes this honest.

The receipt's reversibility rollup shows `contains_irreversible: true` because of the form submission. The pair (writ + receipt) becomes the published evidence on the minimal registry, and the GenAI disclosure on the form points at both URLs.

---

## Core Action Vocabulary (v1 starter set)

The actions used in the worked example are part of the v1 core vocabulary. The shapes below define what each action's namespace owns: the constraint filter shape and the receipt detail shape.

**Note:** This is a starter set sufficient for the worked example. The full core vocabulary will grow as concrete use cases require it. Adding actions is non-breaking — the schema supports any namespaced action that follows the structural rules.

### `core.file.read`

Read a file from local disk. Files are read as raw bytes; consumers decode as needed (UTF-8 for text content, raw for binary).

Constraint filters:
- `paths`: array of permitted files. Required. Each entry is either an absolute path string (no integrity binding), or an object `{ path: string, content_hash?: string }` where `content_hash`, when present, is a `sha256:<hex>` digest the file's bytes must match at read time. Bare strings and objects may be mixed.

Receipt details:
- `bytes_read`: integer (file size in bytes)
- `content_hash_verified`: boolean — true if the matched path entry specified a `content_hash` and the file's bytes matched

Reversibility: `irreversible: false`. Engines typically do not provide undo for reads.

### `core.browser.navigate`

Navigate a browser session to a URL.

Constraint filters:
- `domains`: array of permitted domains. Required.

Receipt details: none required.

Reversibility: `irreversible: false`. Engines that track browser session state can support undo (go back); others cannot.

### `core.form.fill`

Fill form fields on the current page.

Constraint filters:
- `domains`: array of permitted domains. Required.

Receipt details:
- `fields_filled`: integer
- additional action-specific keys may be present (the worked example uses `genai_disclosure_field` to note a specific field of interest)

Reversibility: `irreversible: false`. Engines that track form state can support undo (clear); others cannot.

### `core.form.submit`

Submit a form on the current page.

Constraint filters:
- `domains`: array of permitted domains. Required.
- `max_submissions`: integer ≥ 1. Required for single-use submissions.

Receipt details: none required.

Reversibility: `irreversible: true`. Form submission commits to an external system.

### `core.browser.screenshot`

Capture a screenshot of the current page.

Constraint filters:
- `domains`: array of permitted domains. Required.

Receipt details:
- `saved_to`: filesystem path where the screenshot was written

Reversibility: `irreversible: false`. The file could be deleted; engines typically do not track this for undo.

---

## What v1 Does Not Include

For implementation clarity, the following are explicitly out of scope for v1 and reserved for later:

**Token as publishable artifact.** Tokens are managed by the engine as internal state. They sign actions (when per-action signing is enabled), they carry consumption and time limits, and they are referenced in action entries via `token_consumed`. But they do not appear as their own JSON document or wire format in v1. The schema for a publishable token artifact is reserved for v2.

**Amendment schema detail.** Amendments are referenced in writs (`amendments` array) and receipts (`amendments_applied`, `amendments_requested`), but the full amendment object schema is not specified in v1. The expectation is that an amendment is structurally a small delta over a writ — `scope_added`, `scope_removed`, `constraints_changed`, with `requested_by`, `approved_by`, and `reason` — but the precise shape is deferred until the first implementation needs it.

**Validator interface for external namespaces.** v1 engines handle `core.*` natively and pass through unknown namespaces as opaque data. The interface for registering validators for non-core namespaces is reserved for v2.

**Per-action signing semantics.** The schema reserves the `signature` field on each action entry as nullable. v1 engines need not populate it. v2 may define stronger requirements.

**Engine plugin or extension surface.** How engines extend their own internal functionality (action handlers, persistence backends, approval policies) is engine-implementation business, not part of the protocol.

**Multi-engine coordination beyond delegation.** The protocol assumes a single governing engine per writ. Parallel work happens via child writs; each writ has one engine producing receipts for it. Cross-engine observation or co-witness patterns are out of scope.

**Undo mechanism.** Receipts declare whether the producing engine *can* undo an action (`undo_available`). The mechanism by which undo happens — the procedure, the expiry, the operational steps — is engine-internal and not part of the protocol surface.

**Disclosure as a schema field.** The protocol vocabulary reserves "disclosure" for the mechanism by which an outgoing agent action makes its writ-backed origin visible to the receiver — a text block carrying the writ and receipt URLs so the receiver can traverse to the authority chain. v1 does not specify a schema field for it; engines that need this capability provide it out-of-band (a harness-level helper composing the text from a configured template, for example). A future revision will lift this into the schema as `writ.disclosure_template` (the template the issuer approves) and `receipt.disclosures[]` (each emission with its location and channel). Until that revision lands, any disclosure template lives outside the writ and is not bound by the writ's signature.

---

## Schema Validation Summary

A minimal v1 validator must check:

1. `protocol` is the literal string `"writ/v0"`.
2. `id` matches the expected pattern for its primitive type.
3. All required fields are present.
4. Action identifiers in `scope` match the three-segment pattern.
5. Keys in `constraints` are a subset of `scope`.
6. `mode` matches between a receipt and its referenced writ.
7. Within each action entry: `irreversible: true` implies `undo_available: false`.
8. `result: blocked` requires a `block_reason` object.
9. Signature fields, when present, validate against the declared signing key using Ed25519 over RFC 8785 canonical form of the artifact with the signature field omitted.
10. Extension keys match the namespace pattern.

Deeper validation — constraint filter shapes, action detail shapes, per-namespace semantics — is the responsibility of namespace-specific validators. v1 engines apply this validation for `core.*` and pass through unknown namespaces.

---

## Forward Compatibility Notes

The schema reserves space for several features without implementing them in v1:

- The `user_feedback` object per action (progressive trust)
- The `signature` field per action (per-action signing in v2+)
- Extension namespaces (for non-core actions and metadata)
- The `publish` field on writs (whether and where to publish to a registry) — under consideration for v1 or v0.1 demo addition
- Validator dispatch for non-core namespaces

Forward-compatible additions (new optional fields, new enum values, new action namespaces) do not require a version bump. Breaking changes (removing fields, changing types, changing the meaning of existing fields) require a new protocol version (`writ/v2`).
