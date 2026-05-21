// RFC 8785 (JCS) canonicalization wrapper over the `canonicalize` package.

import canonicalize from "canonicalize";

/** RFC 8785 canonical JSON string for a value. Throws if it is not JSON-serializable. */
export function canonicalJSON(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    throw new Error("canonicalJSON: value is not JSON-serializable");
  }
  return result;
}

/** Canonical JSON of an artifact with its top-level `signature` field omitted — the exact bytes a signature covers. */
export function signingInput(artifact: object): string {
  const { signature: _signature, ...rest } = artifact as Record<string, unknown>;
  return canonicalJSON(rest);
}
