// Action gating: scope, writ lifecycle, and per-core.* constraint filters.

import type { BlockReason } from "@writprotocol/core";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { consumesToken } from "./actions.js";
import type { CheckResult, RunState } from "./types.js";

/** Gate an action against the run's writ. Pure except for reading the file under check. */
export function check(
  run: RunState,
  action: string,
  target: string,
  _details?: Record<string, unknown>,
): CheckResult {
  const writ = run.writ;

  // Scope: the action must be authorized by the writ.
  if (!writ.scope.includes(action)) {
    return block("scope_violation", `${action} is not in the writ's scope`);
  }

  // Lifecycle: the writ must still be live.
  if (writ.status === "revoked") {
    return block("writ_revoked", `writ ${writ.id} has been revoked`);
  }
  if (Date.now() > Date.parse(writ.expires_at)) {
    return block("writ_expired", `writ ${writ.id} expired at ${writ.expires_at}`);
  }

  const constraint = writ.constraints?.[action];

  // Consumption limit (e.g. max_submissions) — checked before execution.
  if (consumesToken(action)) {
    const limit = constraint?.["max_submissions"];
    if (typeof limit === "number" && (run.consumed[action] ?? 0) >= limit) {
      return block("token_exhausted", `${action} limit of ${limit} reached`);
    }
  }

  // Per-action constraint filters.
  if (action === "core.file.read") {
    return checkFileRead(target, constraint);
  }
  return checkDomain(target, constraint);
}

function checkFileRead(
  target: string,
  constraint: Record<string, unknown> | undefined,
): CheckResult {
  const paths = constraint?.["paths"];
  if (!Array.isArray(paths)) {
    return block("constraint_violation", "core.file.read requires a paths constraint");
  }
  const entry = paths.find((p) => matchesPath(p, target));
  if (entry === undefined) {
    return block("constraint_violation", `path ${target} is not in the allowed paths`);
  }
  let content: Buffer;
  try {
    content = readFileSync(target);
  } catch {
    return block("constraint_violation", `file ${target} could not be read`);
  }
  const expected = expectedHashFor(entry);
  if (expected !== undefined) {
    const actual = "sha256:" + createHash("sha256").update(content).digest("hex");
    if (actual !== expected) {
      return block("constraint_violation", `content hash mismatch for ${target}`);
    }
    return { allowed: true, content, content_hash_verified: true };
  }
  return { allowed: true, content, content_hash_verified: false };
}

function matchesPath(entry: unknown, target: string): boolean {
  if (typeof entry === "string") return entry === target;
  if (typeof entry === "object" && entry !== null) {
    const path = (entry as Record<string, unknown>)["path"];
    return typeof path === "string" && path === target;
  }
  return false;
}

function expectedHashFor(entry: unknown): string | undefined {
  if (typeof entry === "object" && entry !== null) {
    const hash = (entry as Record<string, unknown>)["content_hash"];
    if (typeof hash === "string") return hash;
  }
  return undefined;
}

function checkDomain(
  target: string,
  constraint: Record<string, unknown> | undefined,
): CheckResult {
  const domains = constraint?.["domains"];
  if (!Array.isArray(domains)) {
    return block("constraint_violation", "this action requires a domains constraint");
  }
  let host: string;
  try {
    host = new URL(target).hostname;
  } catch {
    return block("constraint_violation", `${target} is not a valid URL`);
  }
  const allowed = domains.some(
    (d) => typeof d === "string" && (host === d || host.endsWith(`.${d}`)),
  );
  if (!allowed) {
    return block("constraint_violation", `${host} is not in the allowed domains`);
  }
  return { allowed: true };
}

function block(rule: BlockReason["rule"], detail: string): CheckResult {
  return { allowed: false, reason: { rule, detail } };
}
