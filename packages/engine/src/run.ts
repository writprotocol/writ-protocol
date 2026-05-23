// Writ loading and the run lifecycle: startRun, record, finalize.

import { PROTOCOL, sign, validateWrit, verify } from "@writprotocol/core";
import type {
  ActionEntry,
  Receipt,
  ReceiptStatus,
  Writ,
  WritMode,
} from "@writprotocol/core";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { consumesToken, isIrreversible } from "./actions.js";
import { publish } from "./publish.js";
import type { EngineConfig, RecordInput, RunOutcome, RunState } from "./types.js";

const DEAD_STATUSES = new Set(["completed", "expired", "revoked"]);
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Read, validate, lifecycle-check, and verify-signature-if-present. Throws if it cannot be run. */
export async function loadWrit(path: string): Promise<Writ> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const result = validateWrit(parsed);
  if (!result.valid) {
    const summary = result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ");
    throw new Error(`invalid writ at ${path}: ${summary}`);
  }
  const writ = parsed as Writ;
  if (DEAD_STATUSES.has(writ.status)) {
    throw new Error(`writ ${writ.id} is ${writ.status} and cannot be run`);
  }
  if (writ.signature) {
    const ok = await verify(writ, writ.issued_by.key);
    if (!ok) {
      throw new Error(`writ ${writ.id} signature does not verify against the issuer's declared key`);
    }
  }
  return writ;
}

/** Begin a run: mint a receipt id, init state, and optionally reserve a registry slot. */
export function startRun(
  config: EngineConfig,
  writ: Writ,
  opts?: { reserve?: boolean },
): RunState {
  const run: RunState = {
    writ,
    receiptId: generateReceiptId(),
    startedAt: new Date().toISOString(),
    actions: [],
    nextSequence: 1,
    consumed: {},
    finalized: false,
  };
  const reserve = opts?.reserve ?? config.registry !== undefined;
  if (reserve) {
    if (!config.registry) {
      throw new Error("startRun: reservation requested but no registry is configured");
    }
    run.receiptUrl = publish(config.registry, buildReceipt(config, run, "pending"));
  }
  return run;
}

/** Record the outcome of one attempted action onto the run's action log. */
export function record(run: RunState, input: RecordInput): ActionEntry {
  const irreversible = isIrreversible(input.action);
  const tokenConsumed = input.result === "success" && consumesToken(input.action);
  if (tokenConsumed) {
    run.consumed[input.action] = (run.consumed[input.action] ?? 0) + 1;
  }
  const entry: ActionEntry = {
    sequence: run.nextSequence++,
    action: input.action,
    timestamp: new Date().toISOString(),
    result: input.result,
    token_consumed: tokenConsumed,
    irreversible,
    undo_available: false,
    user_feedback: { confirmed: null, undone: null, corrected: null, feedback_at: null },
    signature: null,
    extensions: {},
  };
  if (input.target !== undefined) entry.target = input.target;
  if (input.details !== undefined) entry.details = input.details;
  if (input.result === "blocked" && input.blockReason !== undefined) {
    entry.block_reason = input.blockReason;
  }
  if (!irreversible) {
    entry.undo_unavailable_reason = "engine_does_not_support";
  }
  run.actions.push(entry);
  return entry;
}

/** Finalize a run: assemble, sign, and return the receipt. */
export async function finalize(
  config: EngineConfig,
  run: RunState,
  outcome: RunOutcome,
): Promise<Receipt> {
  if (run.finalized) {
    throw new Error(`run for receipt ${run.receiptId} is already finalized`);
  }
  run.finalized = true;
  const completedAt = new Date().toISOString();
  const receipt = buildReceipt(
    config,
    run,
    resolveStatus(run.writ.mode, outcome),
    completedAt,
  );
  receipt.signature = await sign(receipt, config.signingKey, completedAt);
  return receipt;
}

function resolveStatus(mode: WritMode, outcome: RunOutcome): ReceiptStatus {
  return outcome === "completed" && mode === "dryrun" ? "dryrun_completed" : outcome;
}

function buildReceipt(
  config: EngineConfig,
  run: RunState,
  status: ReceiptStatus,
  completedAt?: string,
): Receipt {
  const actions = [...run.actions];
  const receipt: Receipt = {
    protocol: PROTOCOL,
    id: run.receiptId,
    writ: { id: run.writ.id, mode: run.writ.mode, revision: run.writ.revision },
    produced_by: { ...config.identity },
    delegate: run.writ.delegate.id,
    started_at: run.startedAt,
    status,
    actions,
    delegations: [],
    amendments_applied: [],
    amendments_requested: [],
    reversibility: {
      contains_irreversible: actions.some((a) => a.irreversible),
      all_reversible: actions.every((a) => !a.irreversible),
    },
    extensions: {},
  };
  if (completedAt !== undefined) {
    receipt.completed_at = completedAt;
  }
  return receipt;
}

function generateReceiptId(): string {
  let suffix = "";
  for (const byte of randomBytes(10)) {
    suffix += ID_ALPHABET.charAt(byte % ID_ALPHABET.length);
  }
  return `receipt_${suffix}`;
}
