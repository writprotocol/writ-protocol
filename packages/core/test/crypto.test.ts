import { describe, expect, it } from "vitest";
import { generateKeyPair, parsePublicKey, sign, verify } from "../src/index.js";
import { validWrit } from "./fixtures.js";

const SIGNED_AT = "2026-05-28T14:32:00Z";

describe("crypto", () => {
  it("signs and verifies an artifact round-trip", async () => {
    const kp = await generateKeyPair();
    const writ = validWrit();
    const signature = await sign(writ, kp.secretKey, SIGNED_AT);
    expect(await verify({ ...writ, signature }, kp.publicKeyString)).toBe(true);
  });

  it("rejects a tampered artifact", async () => {
    const kp = await generateKeyPair();
    const writ = validWrit();
    const signature = await sign(writ, kp.secretKey, SIGNED_AT);
    const tampered = { ...writ, signature, task: "Do something else entirely" };
    expect(await verify(tampered, kp.publicKeyString)).toBe(false);
  });

  it("rejects verification with the wrong public key", async () => {
    const kp = await generateKeyPair();
    const other = await generateKeyPair();
    const writ = validWrit();
    const signature = await sign(writ, kp.secretKey, SIGNED_AT);
    expect(await verify({ ...writ, signature }, other.publicKeyString)).toBe(false);
  });

  it("returns false when no signature is present", async () => {
    const kp = await generateKeyPair();
    expect(await verify(validWrit(), kp.publicKeyString)).toBe(false);
  });

  it("round-trips a public key through encode and parse", async () => {
    const kp = await generateKeyPair();
    expect(parsePublicKey(kp.publicKeyString)).toEqual(kp.publicKey);
  });

  it("produces a stable signature regardless of field order", async () => {
    const kp = await generateKeyPair();
    const writ = validWrit();
    const reordered = Object.fromEntries(Object.entries(writ).reverse());
    const sigA = await sign(writ, kp.secretKey, SIGNED_AT);
    const sigB = await sign(reordered, kp.secretKey, SIGNED_AT);
    expect(sigA.value).toBe(sigB.value);
  });
});
