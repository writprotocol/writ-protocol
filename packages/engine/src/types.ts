// Engine types: configuration, run state, and the check/record interface.

import type { ActionEntry, BlockReason, Receipt, Writ } from "@writprotocol/core";

/** Identity of the engine producing receipts; mirrors a receipt's `produced_by`. */
export interface EngineIdentity {
  engine: string;
  version: string;
  /** Public key "ed25519:<base64>", matching the engine's signing key. */
  key: string;
}

/** A registry the engine publishes signed artifacts to. */
export interface RegistryConfig {
  /** Local checkout directory of the registry git repo. */
  checkoutPath: string;
  /** Public base URL artifacts resolve under, e.g. "https://registry.writprotocol.dev". */
  baseUrl: string;
  /** Push commits to the configured git remote. Off until the remote exists. */
  push?: boolean;
}

export interface EngineConfig {
  identity: EngineIdentity;
  /** 32-byte ed25519 secret key used to sign receipts. */
  signingKey: Uint8Array;
  /** Registry config; when absent, publishing and reservation are unavailable. */
  registry?: RegistryConfig;
}

/** Mutable per-run state, created by startRun and threaded through check/record/finalize. */
export interface RunState {
  readonly writ: Writ;
  readonly receiptId: string;
  readonly startedAt: string;
  readonly actions: ActionEntry[];
  /** Next action sequence number. */
  nextSequence: number;
  /** Consumption counts keyed by action id. */
  consumed: Record<string, number>;
  finalized: boolean;
  /** Public registry URL of the receipt, set when the run reserved a slot. */
  receiptUrl?: string;
}

/** Result of gating an action. On allow, a file read carries the file's bytes. */
export type CheckResult =
  | { allowed: true; content?: Uint8Array; content_hash_verified?: boolean }
  | { allowed: false; reason: BlockReason };

export type ActionResult = "success" | "failure" | "blocked";

/** The outcome of one attempted action, passed to record(). */
export interface RecordInput {
  action: string;
  target?: string;
  details?: Record<string, unknown>;
  result: ActionResult;
  /** Required when result is "blocked". */
  blockReason?: BlockReason;
}

/** The terminal outcome of a run, passed to finalize(). */
export type RunOutcome = "completed" | "failed" | "terminated";

/** The engine surface, bound to a configuration by createEngine. */
export interface Engine {
  loadWrit(path: string): Promise<Writ>;
  startRun(writ: Writ, opts?: { reserve?: boolean }): RunState;
  check(
    run: RunState,
    action: string,
    target: string,
    details?: Record<string, unknown>,
  ): CheckResult;
  record(run: RunState, input: RecordInput): ActionEntry;
  finalize(run: RunState, outcome: RunOutcome): Promise<Receipt>;
  publish(artifact: Writ | Receipt): string;
}
