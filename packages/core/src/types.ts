// Writ Protocol wire-format types. See docs/writ-protocol-spec-v1.md.
// Structural shapes only; cross-field and cross-artifact rules live in the validator.

/** Version identifier carried by every primitive. */
export const PROTOCOL = "writ/v0";
export type Protocol = typeof PROTOCOL;

// ---- Identity and signing ----

export type IdentityType = "email" | "github" | "oidc" | "saml" | "url";

/** How an identity claim was verified. `method` discriminates; defaults to "self" when absent. */
export interface Attestation {
  method: string;
  [key: string]: unknown;
}

export interface Identity {
  type: IdentityType;
  value: string;
  attestation?: Attestation;
}

/** An entity issuing or witnessing an artifact. */
export interface Principal {
  handle: string;
  identities: Identity[];
  /** Public key as "<algorithm>:<base64>"; ed25519 only. */
  key: string;
}

export type SignatureAlgorithm = "ed25519";

export interface Signature {
  algorithm: SignatureAlgorithm;
  /** Base64-encoded signature over the RFC 8785 canonical artifact, signature field omitted. */
  value: string;
  signed_at: string;
}

/** Namespaced non-authoritative metadata; keys match the extension-key pattern. */
export type Extensions = Record<string, unknown>;

// ---- Writ ----

export type WritMode = "live" | "dryrun";

export type WritStatus =
  | "issued"
  | "active"
  | "amended"
  | "completed"
  | "expired"
  | "revoked";

export interface Delegate {
  type: "agent";
  /** Convention "agent:<name>". */
  id: string;
  description?: string;
}

/** A per-action constraint filter; contents are owned by the action's namespace. */
export interface ConstraintObject {
  extensions?: Extensions;
  [key: string]: unknown;
}

/** Map from action identifier (must appear in scope) to its constraint filter. */
export type Constraints = Record<string, ConstraintObject>;

export interface TemplateRef {
  [key: string]: unknown;
}

/** A task-scoped delegation of authority from a human to an agent. */
export interface Writ {
  protocol: Protocol;
  id: string;
  mode: WritMode;
  issued_by: Principal;
  delegate: Delegate;
  task: string;
  scope: string[];
  issued_at: string;
  expires_at: string;
  status: WritStatus;
  revision: number;
  parent?: string;
  intent?: string;
  constraints?: Constraints;
  amendments?: string[];
  template?: TemplateRef;
  signature?: Signature;
  extensions?: Extensions;
}

// ---- Receipt ----

export type ReceiptStatus =
  | "pending"
  | "completed"
  | "failed"
  | "terminated"
  | "dryrun_completed";

export type ActionResult = "success" | "failure" | "blocked";

export type BlockRule =
  | "scope_violation"
  | "constraint_violation"
  | "token_exhausted"
  | "writ_expired"
  | "writ_revoked";

export type UndoUnavailableReason =
  | "undo_window_expired"
  | "engine_does_not_support"
  | "external_coordination_required"
  | "state_lost";

export interface WritReference {
  id: string;
  mode: WritMode;
  revision: number;
}

export interface ProducedBy {
  /** Namespaced engine identifier; the reference engine is "core.writprotocol-engine". */
  engine: string;
  version: string;
  key: string;
}

export interface BlockReason {
  rule: BlockRule;
  detail: string;
}

/** Progressive-trust fields; v0 engines write null for all. */
export interface UserFeedback {
  confirmed: boolean | null;
  undone: boolean | null;
  corrected: boolean | null;
  feedback_at: string | null;
}

export interface ActionEntry {
  sequence: number;
  action: string;
  timestamp: string;
  result: ActionResult;
  target?: string;
  details?: Record<string, unknown>;
  block_reason?: BlockReason;
  token_consumed: boolean;
  irreversible: boolean;
  undo_available: boolean;
  undo_unavailable_reason?: UndoUnavailableReason;
  user_feedback: UserFeedback;
  signature: Signature | null;
  extensions?: Extensions;
}

export interface Delegation {
  child_writ: string;
  child_receipt: string;
  delegate: string;
}

export interface AmendmentApplied {
  amendment_id: string;
  /** Revision transition, e.g. "1 → 2". */
  revision: string;
  applied_at: string;
}

export interface AmendmentRequested {
  requested_at: string;
  scope_requested: string[];
  reason: string;
  decision: "approved" | "declined";
  decided_at: string;
  amendment_id?: string;
}

export interface Reversibility {
  contains_irreversible: boolean;
  all_reversible: boolean;
}

/** An engine's record of execution under a writ. */
export interface Receipt {
  protocol: Protocol;
  id: string;
  writ: WritReference;
  produced_by: ProducedBy;
  delegate: string;
  started_at: string;
  /** Absent while the receipt is a pending (reserved) placeholder. */
  completed_at?: string;
  status: ReceiptStatus;
  actions: ActionEntry[];
  delegations: Delegation[];
  amendments_applied: AmendmentApplied[];
  amendments_requested: AmendmentRequested[];
  reversibility: Reversibility;
  signature?: Signature;
  extensions?: Extensions;
}
