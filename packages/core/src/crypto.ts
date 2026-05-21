// Ed25519 signing and verification over RFC 8785 canonical JSON.

import { keygenAsync, signAsync, verifyAsync } from "@noble/ed25519";
import type { Signature } from "./types.js";
import { signingInput } from "./canonicalize.js";

const KEY_PREFIX = "ed25519:";
const PUBLIC_KEY_BYTES = 32;
const SECRET_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export interface KeyPair {
  /** 32-byte Ed25519 secret key. */
  secretKey: Uint8Array;
  /** 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** Public key in wire format: "ed25519:<base64>". */
  publicKeyString: string;
}

/** Generate a fresh Ed25519 keypair. */
export async function generateKeyPair(): Promise<KeyPair> {
  const { secretKey, publicKey } = await keygenAsync();
  return { secretKey, publicKey, publicKeyString: encodePublicKey(publicKey) };
}

/** Encode a raw 32-byte public key as "ed25519:<base64>". */
export function encodePublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(
      `encodePublicKey: expected ${PUBLIC_KEY_BYTES} bytes, got ${publicKey.length}`,
    );
  }
  return KEY_PREFIX + bytesToBase64(publicKey);
}

/** Parse a wire-format "ed25519:<base64>" public key into raw bytes. */
export function parsePublicKey(key: string): Uint8Array {
  if (!key.startsWith(KEY_PREFIX)) {
    throw new Error(`parsePublicKey: unsupported key format, expected "${KEY_PREFIX}…"`);
  }
  const bytes = base64ToBytes(key.slice(KEY_PREFIX.length));
  if (bytes.length !== PUBLIC_KEY_BYTES) {
    throw new Error(
      `parsePublicKey: expected ${PUBLIC_KEY_BYTES}-byte key, got ${bytes.length}`,
    );
  }
  return bytes;
}

/** Sign an artifact; returns a Signature the caller attaches as `artifact.signature`. */
export async function sign(
  artifact: object,
  secretKey: Uint8Array,
  signedAt: string,
): Promise<Signature> {
  if (secretKey.length !== SECRET_KEY_BYTES) {
    throw new Error(
      `sign: expected ${SECRET_KEY_BYTES}-byte secret key, got ${secretKey.length}`,
    );
  }
  const message = new TextEncoder().encode(signingInput(artifact));
  const sigBytes = await signAsync(message, secretKey);
  return { algorithm: "ed25519", value: bytesToBase64(sigBytes), signed_at: signedAt };
}

/** Verify an artifact's `signature` field against a public key. False if absent, malformed, or invalid. */
export async function verify(
  artifact: object,
  publicKey: string | Uint8Array,
): Promise<boolean> {
  const sig = (artifact as Record<string, unknown>).signature;
  if (!isSignatureObject(sig) || sig.algorithm !== "ed25519") {
    return false;
  }
  let pub: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pub = typeof publicKey === "string" ? parsePublicKey(publicKey) : publicKey;
    sigBytes = base64ToBytes(sig.value);
  } catch {
    return false;
  }
  if (sigBytes.length !== SIGNATURE_BYTES || pub.length !== PUBLIC_KEY_BYTES) {
    return false;
  }
  const message = new TextEncoder().encode(signingInput(artifact));
  try {
    return await verifyAsync(sigBytes, message, pub);
  } catch {
    return false;
  }
}

function isSignatureObject(value: unknown): value is Signature {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).algorithm === "string" &&
    typeof (value as Record<string, unknown>).value === "string"
  );
}
