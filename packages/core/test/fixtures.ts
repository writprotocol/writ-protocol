// Structurally valid artifacts for tests. Each call returns a fresh object so
// tests can mutate freely. Shapes follow the worked example in the spec.

import type { Receipt, Writ } from "../src/index.js";

export function validWrit(): Writ {
  return {
    protocol: "writ/v0",
    id: "writ_nl5k2c",
    mode: "live",
    issued_by: {
      handle: "@ilkka",
      identities: [
        { type: "email", value: "ilkka@writprotocol.dev", attestation: { method: "self" } },
      ],
      key: "ed25519:GLb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=",
    },
    delegate: {
      type: "agent",
      id: "agent:claude-code",
      description: "Claude Code, terminal-native coding agent (Anthropic)",
    },
    task: "Submit the example application.",
    intent: "Fill and submit the example form exactly as drafted.",
    scope: [
      "core.file.read",
      "core.browser.navigate",
      "core.form.fill",
      "core.form.submit",
      "core.browser.screenshot",
    ],
    constraints: {
      "core.file.read": {
        paths: ["/Users/ilkka/writ-protocol/application.md"],
        content_hash: "sha256:7a8f3b2e9c1d4f6a8b5c0e2f4d6a8b3c5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b",
      },
      "core.browser.navigate": { domains: ["example.org"] },
      "core.form.fill": { domains: ["example.org"] },
      "core.form.submit": { domains: ["example.org"], max_submissions: 1 },
      "core.browser.screenshot": { domains: ["example.org"] },
    },
    issued_at: "2026-05-28T14:32:00Z",
    expires_at: "2026-05-28T15:32:00Z",
    status: "active",
    revision: 1,
    amendments: [],
    extensions: {},
  };
}

export function validReceipt(): Receipt {
  return {
    protocol: "writ/v0",
    id: "receipt_4k9m2p",
    writ: { id: "writ_nl5k2c", mode: "live", revision: 1 },
    produced_by: {
      engine: "core.writprotocol-engine",
      version: "0.1.0",
      key: "ed25519:enGLNebgenK9w7lshQhqowtrbLDFw4rXAxZv8gK2VwAyE=",
    },
    delegate: "agent:claude-code",
    started_at: "2026-05-28T14:33:12Z",
    completed_at: "2026-05-28T14:38:47Z",
    status: "completed",
    actions: [
      {
        sequence: 1,
        action: "core.file.read",
        timestamp: "2026-05-28T14:33:14Z",
        result: "success",
        target: "/Users/ilkka/writ-protocol/application.md",
        details: { bytes_read: 18432, content_hash_verified: true },
        token_consumed: false,
        irreversible: false,
        undo_available: false,
        undo_unavailable_reason: "engine_does_not_support",
        user_feedback: { confirmed: null, undone: null, corrected: null, feedback_at: null },
        signature: null,
        extensions: {},
      },
      {
        sequence: 2,
        action: "core.form.submit",
        timestamp: "2026-05-28T14:38:21Z",
        result: "success",
        target: "https://example.org/propose/",
        token_consumed: true,
        irreversible: true,
        undo_available: false,
        user_feedback: { confirmed: null, undone: null, corrected: null, feedback_at: null },
        signature: null,
        extensions: {},
      },
    ],
    delegations: [],
    amendments_applied: [],
    amendments_requested: [],
    reversibility: { contains_irreversible: true, all_reversible: false },
    extensions: {},
  };
}

export function pendingReceipt(): Receipt {
  return {
    protocol: "writ/v0",
    id: "receipt_4k9m2p",
    writ: { id: "writ_nl5k2c", mode: "live", revision: 1 },
    produced_by: {
      engine: "core.writprotocol-engine",
      version: "0.1.0",
      key: "ed25519:enGLNebgenK9w7lshQhqowtrbLDFw4rXAxZv8gK2VwAyE=",
    },
    delegate: "agent:claude-code",
    started_at: "2026-05-28T14:33:12Z",
    status: "pending",
    actions: [],
    delegations: [],
    amendments_applied: [],
    amendments_requested: [],
    reversibility: { contains_irreversible: false, all_reversible: true },
    extensions: {},
  };
}
