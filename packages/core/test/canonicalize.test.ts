import { describe, expect, it } from "vitest";
import { canonicalJSON, signingInput } from "../src/index.js";

describe("canonicalJSON", () => {
  it("sorts object keys lexicographically", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("is independent of input key order", () => {
    const a = canonicalJSON({ x: 1, y: { d: 4, c: 3 } });
    const b = canonicalJSON({ y: { c: 3, d: 4 }, x: 1 });
    expect(a).toBe(b);
  });

  it("throws on non-serializable values", () => {
    expect(() => canonicalJSON(undefined)).toThrow();
  });
});

describe("signingInput", () => {
  it("omits the top-level signature field", () => {
    const artifact = {
      id: "writ_abc123",
      signature: { algorithm: "ed25519", value: "x", signed_at: "t" },
    };
    expect(signingInput(artifact)).toBe(canonicalJSON({ id: "writ_abc123" }));
  });

  it("equals canonicalJSON when no signature is present", () => {
    const artifact = { id: "writ_abc123", revision: 1 };
    expect(signingInput(artifact)).toBe(canonicalJSON(artifact));
  });
});
