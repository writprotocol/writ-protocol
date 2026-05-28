// Writ Protocol structural validator. Implements the Schema Validation Summary
// in docs/writ-protocol-spec-v1.md. Signature verification (rule 9) is async and
// lives in crypto.ts (`verify`); everything else is synchronous and structural.

import { Temporal } from "@js-temporal/polyfill";
import type { Receipt, Writ } from "./types.js";
import { PROTOCOL } from "./types.js";

export interface ValidationError {
  /** Dotted path to the offending field, e.g. "scope[2]" or "actions[0].result". */
  path: string;
  /** Short rule identifier. */
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const WRIT_ID_PATTERN = /^writ_[a-z0-9]{6,}$/;
const RECEIPT_ID_PATTERN = /^receipt_[a-z0-9]{6,}$/;
const ACTION_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;
const EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]+$/;

const WRIT_MODES = new Set(["live", "dryrun"]);
const WRIT_STATUSES = new Set([
  "issued",
  "active",
  "amended",
  "completed",
  "expired",
  "revoked",
]);
const RECEIPT_STATUSES = new Set([
  "pending",
  "completed",
  "failed",
  "terminated",
  "dryrun_completed",
]);
const ACTION_RESULTS = new Set(["success", "failure", "blocked"]);
const BLOCK_RULES = new Set([
  "scope_violation",
  "constraint_violation",
  "token_exhausted",
  "writ_expired",
  "writ_revoked",
]);
const UNDO_REASONS = new Set([
  "undo_window_expired",
  "engine_does_not_support",
  "external_coordination_required",
  "state_lost",
]);

type Add = (path: string, rule: string, message: string) => void;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

function isIsoDatetime(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    Temporal.Instant.from(v);
    return true;
  } catch {
    return false;
  }
}

/** Validate a writ against the v1 structural rules. */
export function validateWrit(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const add: Add = (path, rule, message) => errors.push({ path, rule, message });

  if (!isObject(input)) {
    add("", "type", "writ must be a JSON object");
    return { valid: false, errors };
  }
  const writ = input;

  // R1: protocol identifier
  if (writ.protocol !== PROTOCOL) {
    add("protocol", "protocol", `protocol must be "${PROTOCOL}"`);
  }

  // R2: id pattern
  if (!isString(writ.id)) {
    add("id", "required_field", "id is required and must be a string");
  } else if (!WRIT_ID_PATTERN.test(writ.id)) {
    add("id", "id_pattern", `id must match ${WRIT_ID_PATTERN}`);
  }

  // R3: required fields, well-typed
  if (!isString(writ.mode) || !WRIT_MODES.has(writ.mode)) {
    add("mode", "required_field", 'mode must be "live" or "dryrun"');
  }
  validatePrincipal(writ.issued_by, "issued_by", add);
  validateDelegate(writ.delegate, add);
  if (!isString(writ.task)) {
    add("task", "required_field", "task is required and must be a string");
  }
  if (!isIsoDatetime(writ.issued_at)) {
    add("issued_at", "required_field", "issued_at is required and must be an ISO 8601 datetime");
  }
  if (!isIsoDatetime(writ.expires_at)) {
    add("expires_at", "required_field", "expires_at is required and must be an ISO 8601 datetime");
  }
  if (!isString(writ.status) || !WRIT_STATUSES.has(writ.status)) {
    add("status", "required_field", `status must be one of ${[...WRIT_STATUSES].join(", ")}`);
  }
  if (!isInteger(writ.revision) || writ.revision < 1) {
    add("revision", "required_field", "revision must be an integer >= 1");
  }

  // R4: scope entries match the action-id pattern, non-empty, unique
  const scope = writ.scope;
  if (!Array.isArray(scope) || scope.length === 0) {
    add("scope", "scope", "scope must be a non-empty array of action identifiers");
  } else {
    const seen = new Set<string>();
    scope.forEach((entry, i) => {
      if (!isString(entry)) {
        add(`scope[${i}]`, "scope", "scope entry must be a string");
        return;
      }
      if (!ACTION_ID_PATTERN.test(entry)) {
        add(
          `scope[${i}]`,
          "action_pattern",
          `"${entry}" is not a valid action identifier (need >=3 dot-separated segments)`,
        );
      }
      if (seen.has(entry)) {
        add(`scope[${i}]`, "scope_unique", `duplicate scope entry "${entry}"`);
      }
      seen.add(entry);
    });
  }

  // R5: constraint keys are a subset of scope
  if (writ.constraints !== undefined) {
    if (!isObject(writ.constraints)) {
      add("constraints", "constraints", "constraints must be an object");
    } else {
      const scopeSet = new Set(isStringArray(scope) ? scope : []);
      for (const [action, filter] of Object.entries(writ.constraints)) {
        if (!scopeSet.has(action)) {
          add(
            `constraints.${action}`,
            "constraints_subset",
            `constraint key "${action}" is not in scope`,
          );
        }
        if (!isObject(filter)) {
          add(`constraints.${action}`, "constraints", "constraint value must be an object");
        } else if (filter.extensions !== undefined) {
          validateExtensions(filter.extensions, `constraints.${action}.extensions`, add);
        }
      }
    }
  }

  // Optional fields, well-typed when present
  if (writ.parent !== undefined && !isString(writ.parent)) {
    add("parent", "type", "parent must be a string (writ id)");
  }
  if (writ.intent !== undefined && !isString(writ.intent)) {
    add("intent", "type", "intent must be a string");
  }
  if (writ.amendments !== undefined && !isStringArray(writ.amendments)) {
    add("amendments", "type", "amendments must be an array of strings");
  }
  if (writ.template !== undefined && !isObject(writ.template)) {
    add("template", "type", "template must be an object");
  }
  // Disclosure: reserved field, optional string. Deeper validation reserved for v2.
  if (writ.disclosure_template !== undefined && !isString(writ.disclosure_template)) {
    add("disclosure_template", "type", "disclosure_template must be a string");
  }
  if (writ.signature !== undefined) {
    validateSignatureShape(writ.signature, "signature", add);
  }

  // R10: extension keys match the namespace pattern
  if (writ.extensions !== undefined) {
    validateExtensions(writ.extensions, "extensions", add);
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a receipt against the v1 structural rules. */
export function validateReceipt(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const add: Add = (path, rule, message) => errors.push({ path, rule, message });

  if (!isObject(input)) {
    add("", "type", "receipt must be a JSON object");
    return { valid: false, errors };
  }
  const receipt = input;

  // R1: protocol identifier
  if (receipt.protocol !== PROTOCOL) {
    add("protocol", "protocol", `protocol must be "${PROTOCOL}"`);
  }

  // R2: id pattern
  if (!isString(receipt.id)) {
    add("id", "required_field", "id is required and must be a string");
  } else if (!RECEIPT_ID_PATTERN.test(receipt.id)) {
    add("id", "id_pattern", `id must match ${RECEIPT_ID_PATTERN}`);
  }

  // R3: writ reference
  if (!isObject(receipt.writ)) {
    add("writ", "required_field", "writ reference is required and must be an object");
  } else {
    if (!isString(receipt.writ.id)) {
      add("writ.id", "required_field", "writ.id is required and must be a string");
    }
    if (!isString(receipt.writ.mode) || !WRIT_MODES.has(receipt.writ.mode)) {
      add("writ.mode", "required_field", 'writ.mode must be "live" or "dryrun"');
    }
    if (!isInteger(receipt.writ.revision) || receipt.writ.revision < 1) {
      add("writ.revision", "required_field", "writ.revision must be an integer >= 1");
    }
  }

  // R3: produced_by
  if (!isObject(receipt.produced_by)) {
    add("produced_by", "required_field", "produced_by is required and must be an object");
  } else {
    if (!isString(receipt.produced_by.engine)) {
      add("produced_by.engine", "required_field", "produced_by.engine is required");
    }
    if (!isString(receipt.produced_by.version)) {
      add("produced_by.version", "required_field", "produced_by.version is required");
    }
    if (!isString(receipt.produced_by.key)) {
      add("produced_by.key", "required_field", "produced_by.key is required");
    }
  }

  // R3: remaining scalar required fields
  if (!isString(receipt.delegate)) {
    add("delegate", "required_field", "delegate is required and must be a string");
  }
  if (!isIsoDatetime(receipt.started_at)) {
    add("started_at", "required_field", "started_at is required and must be an ISO 8601 datetime");
  }
  // completed_at is required unless the receipt is a pending (reserved) placeholder
  if (receipt.status === "pending") {
    if (receipt.completed_at !== undefined && !isIsoDatetime(receipt.completed_at)) {
      add("completed_at", "type", "completed_at must be an ISO 8601 datetime when present");
    }
  } else if (!isIsoDatetime(receipt.completed_at)) {
    add("completed_at", "required_field", "completed_at is required (ISO 8601 datetime) unless status is pending");
  }
  if (!isString(receipt.status) || !RECEIPT_STATUSES.has(receipt.status)) {
    add("status", "required_field", `status must be one of ${[...RECEIPT_STATUSES].join(", ")}`);
  }

  // R3, R4, R7, R8: action log
  if (!Array.isArray(receipt.actions)) {
    add("actions", "required_field", "actions is required and must be an array");
  } else {
    receipt.actions.forEach((entry, i) => validateActionEntry(entry, `actions[${i}]`, add));
  }

  // R3: required arrays that may be empty
  for (const field of ["delegations", "amendments_applied", "amendments_requested"] as const) {
    if (!Array.isArray(receipt[field])) {
      add(field, "required_field", `${field} is required and must be an array`);
    }
  }

  // R3: reversibility rollup
  if (!isObject(receipt.reversibility)) {
    add("reversibility", "required_field", "reversibility is required and must be an object");
  } else {
    if (!isBoolean(receipt.reversibility.contains_irreversible)) {
      add(
        "reversibility.contains_irreversible",
        "required_field",
        "reversibility.contains_irreversible must be a boolean",
      );
    }
    if (!isBoolean(receipt.reversibility.all_reversible)) {
      add(
        "reversibility.all_reversible",
        "required_field",
        "reversibility.all_reversible must be a boolean",
      );
    }
  }

  // Disclosure: reserved field, optional array. Deeper validation reserved for v2.
  if (receipt.disclosures !== undefined && !Array.isArray(receipt.disclosures)) {
    add("disclosures", "type", "disclosures must be an array");
  }

  if (receipt.signature !== undefined) {
    validateSignatureShape(receipt.signature, "signature", add);
  }

  // R10: extension keys match the namespace pattern
  if (receipt.extensions !== undefined) {
    validateExtensions(receipt.extensions, "extensions", add);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Cross-artifact checks (rule 6): a receipt against the writ it executed.
 * Call after `validateReceipt` and `validateWrit` pass.
 */
export function validateReceiptAgainstWrit(receipt: Receipt, writ: Writ): ValidationResult {
  const errors: ValidationError[] = [];
  const add: Add = (path, rule, message) => errors.push({ path, rule, message });

  if (receipt.writ.id !== writ.id) {
    add(
      "writ.id",
      "writ_reference",
      `receipt references writ "${receipt.writ.id}" but was validated against "${writ.id}"`,
    );
  }
  // R6: mode matches between a receipt and its referenced writ
  if (receipt.writ.mode !== writ.mode) {
    add(
      "writ.mode",
      "mode_match",
      `receipt mode "${receipt.writ.mode}" does not match writ mode "${writ.mode}"`,
    );
  }

  const scope = new Set(writ.scope);
  receipt.actions.forEach((entry, i) => {
    if (!scope.has(entry.action)) {
      add(
        `actions[${i}].action`,
        "scope_membership",
        `action "${entry.action}" is not in the writ's scope`,
      );
    }
  });

  return { valid: errors.length === 0, errors };
}

function validateActionEntry(entry: unknown, path: string, add: Add): void {
  if (!isObject(entry)) {
    add(path, "type", "action entry must be an object");
    return;
  }

  if (!isInteger(entry.sequence) || entry.sequence < 1) {
    add(`${path}.sequence`, "required_field", "sequence must be an integer >= 1");
  }

  // R4: action identifier shape
  if (!isString(entry.action)) {
    add(`${path}.action`, "required_field", "action is required and must be a string");
  } else if (!ACTION_ID_PATTERN.test(entry.action)) {
    add(`${path}.action`, "action_pattern", `"${entry.action}" is not a valid action identifier`);
  }

  if (!isIsoDatetime(entry.timestamp)) {
    add(`${path}.timestamp`, "required_field", "timestamp is required and must be an ISO 8601 datetime");
  }

  const result = entry.result;
  if (!isString(result) || !ACTION_RESULTS.has(result)) {
    add(`${path}.result`, "required_field", "result must be one of success, failure, blocked");
  }

  if (entry.target !== undefined && !isString(entry.target)) {
    add(`${path}.target`, "type", "target must be a string");
  }
  if (entry.details !== undefined && !isObject(entry.details)) {
    add(`${path}.details`, "type", "details must be an object");
  }

  // R8: result "blocked" requires a block_reason object
  if (result === "blocked") {
    if (!isObject(entry.block_reason)) {
      add(`${path}.block_reason`, "block_reason", "block_reason is required when result is blocked");
    } else {
      if (!isString(entry.block_reason.rule) || !BLOCK_RULES.has(entry.block_reason.rule)) {
        add(
          `${path}.block_reason.rule`,
          "block_reason",
          `block_reason.rule must be one of ${[...BLOCK_RULES].join(", ")}`,
        );
      }
      if (!isString(entry.block_reason.detail)) {
        add(
          `${path}.block_reason.detail`,
          "block_reason",
          "block_reason.detail is required and must be a string",
        );
      }
    }
  } else if (entry.block_reason !== undefined) {
    add(
      `${path}.block_reason`,
      "block_reason",
      "block_reason must only be present when result is blocked",
    );
  }

  if (!isBoolean(entry.token_consumed)) {
    add(`${path}.token_consumed`, "required_field", "token_consumed must be a boolean");
  }

  const irreversible = entry.irreversible;
  const undoAvailable = entry.undo_available;
  if (!isBoolean(irreversible)) {
    add(`${path}.irreversible`, "required_field", "irreversible must be a boolean");
  }
  if (!isBoolean(undoAvailable)) {
    add(`${path}.undo_available`, "required_field", "undo_available must be a boolean");
  }

  // R7: irreversible: true implies undo_available: false
  if (irreversible === true && undoAvailable === true) {
    add(
      `${path}.undo_available`,
      "reversibility",
      "undo_available must be false when irreversible is true",
    );
  }

  if (
    entry.undo_unavailable_reason !== undefined &&
    (!isString(entry.undo_unavailable_reason) || !UNDO_REASONS.has(entry.undo_unavailable_reason))
  ) {
    add(
      `${path}.undo_unavailable_reason`,
      "undo_reason",
      `undo_unavailable_reason must be one of ${[...UNDO_REASONS].join(", ")}`,
    );
  }

  // user_feedback: required object; v1 fields are boolean or null
  if (!isObject(entry.user_feedback)) {
    add(`${path}.user_feedback`, "required_field", "user_feedback is required and must be an object");
  } else {
    for (const key of ["confirmed", "undone", "corrected"] as const) {
      const value = entry.user_feedback[key];
      if (value !== null && !isBoolean(value)) {
        add(
          `${path}.user_feedback.${key}`,
          "type",
          `user_feedback.${key} must be a boolean or null`,
        );
      }
    }
    const feedbackAt = entry.user_feedback.feedback_at;
    if (feedbackAt !== null && !isString(feedbackAt)) {
      add(
        `${path}.user_feedback.feedback_at`,
        "type",
        "user_feedback.feedback_at must be a string or null",
      );
    }
  }

  // signature: required field, nullable
  if (entry.signature === undefined) {
    add(`${path}.signature`, "required_field", "signature is required (may be null)");
  } else if (entry.signature !== null) {
    validateSignatureShape(entry.signature, `${path}.signature`, add);
  }

  if (entry.extensions !== undefined) {
    validateExtensions(entry.extensions, `${path}.extensions`, add);
  }
}

function validatePrincipal(value: unknown, path: string, add: Add): void {
  if (!isObject(value)) {
    add(path, "required_field", `${path} is required and must be a Principal object`);
    return;
  }
  if (!isString(value.handle)) {
    add(`${path}.handle`, "required_field", "handle is required and must be a string");
  }
  if (!isString(value.key)) {
    add(`${path}.key`, "required_field", "key is required and must be a string");
  }
  if (!Array.isArray(value.identities)) {
    add(`${path}.identities`, "required_field", "identities is required and must be an array");
    return;
  }
  value.identities.forEach((identity, i) => {
    const ipath = `${path}.identities[${i}]`;
    if (!isObject(identity)) {
      add(ipath, "type", "identity must be an object");
      return;
    }
    if (!isString(identity.type)) {
      add(`${ipath}.type`, "required_field", "identity type is required and must be a string");
    }
    if (!isString(identity.value)) {
      add(`${ipath}.value`, "required_field", "identity value is required and must be a string");
    }
    if (identity.attestation !== undefined) {
      if (!isObject(identity.attestation)) {
        add(`${ipath}.attestation`, "type", "attestation must be an object");
      } else if (!isString(identity.attestation.method)) {
        add(
          `${ipath}.attestation.method`,
          "required_field",
          "attestation.method is required and must be a string",
        );
      }
    }
  });
}

function validateDelegate(value: unknown, add: Add): void {
  if (!isObject(value)) {
    add("delegate", "required_field", "delegate is required and must be an object");
    return;
  }
  if (value.type !== "agent") {
    add("delegate.type", "delegate", 'delegate.type must be "agent"');
  }
  if (!isString(value.id)) {
    add("delegate.id", "required_field", "delegate.id is required and must be a string");
  }
  if (value.description !== undefined && !isString(value.description)) {
    add("delegate.description", "type", "delegate.description must be a string");
  }
}

function validateSignatureShape(value: unknown, path: string, add: Add): void {
  if (!isObject(value)) {
    add(path, "signature", "signature must be an object");
    return;
  }
  if (value.algorithm !== "ed25519") {
    add(`${path}.algorithm`, "signature", 'signature.algorithm must be "ed25519"');
  }
  if (!isString(value.value)) {
    add(`${path}.value`, "signature", "signature.value is required and must be a string");
  }
  if (!isString(value.signed_at)) {
    add(`${path}.signed_at`, "signature", "signature.signed_at is required and must be a string");
  }
}

function validateExtensions(value: unknown, path: string, add: Add): void {
  if (!isObject(value)) {
    add(path, "extensions", `${path} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) {
    if (!EXTENSION_KEY_PATTERN.test(key)) {
      add(
        `${path}.${key}`,
        "extension_key",
        `extension key "${key}" must match ${EXTENSION_KEY_PATTERN}`,
      );
    }
  }
}
