#!/usr/bin/env node
// Generate the canonical example writ + receipt pair for the public docs.
//
// Publishes a stable, structurally complete pair to the configured registry:
//   - writ_example01:   signed writ, scope of three core actions, example.org domain
//   - receipt_example01: signed receipt with three recorded actions, status: completed
//
// Both are signed with a dedicated demo keypair at ~/.writ/keys/example.json
// (separate from any real issuer key, so this pair never gets confused with
// real authority). Re-running rotates only the timestamps + signatures;
// content hashes, ids, and structure stay stable.

import { generateKeyPair, PROTOCOL, sign } from "@writprotocol/core";
import { createEngine, ENGINE_VERSION } from "@writprotocol/engine";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_PATH = join(homedir(), ".writ", "keys", "example.json");
const REGISTRY_PATH = process.env["WRIT_REGISTRY"] ?? join(__dirname, "..", "..", "registry");

const WRIT_ID = "writ_example01";
const RECEIPT_ID = "receipt_example01";

async function loadOrGenerateKey() {
  mkdirSync(dirname(KEY_PATH), { recursive: true, mode: 0o700 });
  chmodSync(dirname(KEY_PATH), 0o700);
  if (existsSync(KEY_PATH)) {
    chmodSync(KEY_PATH, 0o600);
    const file = JSON.parse(readFileSync(KEY_PATH, "utf8"));
    return {
      secretKey: new Uint8Array(Buffer.from(file.secret_key, "base64")),
      publicKey: file.public_key,
    };
  }
  const kp = await generateKeyPair();
  writeFileSync(
    KEY_PATH,
    JSON.stringify(
      { secret_key: Buffer.from(kp.secretKey).toString("base64"), public_key: kp.publicKeyString },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  chmodSync(KEY_PATH, 0o600);
  return { secretKey: kp.secretKey, publicKey: kp.publicKeyString };
}

function buildWrit(publicKey, issuedAt) {
  return {
    protocol: PROTOCOL,
    id: WRIT_ID,
    mode: "live",
    issued_by: {
      handle: "@example",
      identities: [
        { type: "email", value: "example@example.org", attestation: { method: "self" } },
      ],
      key: publicKey,
    },
    delegate: {
      type: "agent",
      id: "agent:example",
      description: "Reference example. Not a real agent identifier.",
    },
    task: "Demonstration writ for the Writ Protocol reference implementation.",
    intent:
      "A minimal, structurally complete writ + receipt pair, signed with a dedicated demo keypair. Re-generatable by running scripts/build-example.mjs.",
    scope: ["core.browser.navigate", "core.form.submit", "core.browser.screenshot"],
    constraints: {
      "core.browser.navigate": { domains: ["example.org"] },
      "core.form.submit": { domains: ["example.org"], max_submissions: 1 },
      "core.browser.screenshot": { domains: ["example.org"] },
    },
    issued_at: issuedAt,
    expires_at: "2099-01-01T00:00:00Z",
    status: "active",
    revision: 1,
  };
}

function buildRunState(writ, startedAt) {
  return {
    writ,
    receiptId: RECEIPT_ID,
    startedAt,
    actions: [],
    nextSequence: 1,
    consumed: {},
    finalized: false,
  };
}

async function main() {
  const { secretKey, publicKey } = await loadOrGenerateKey();
  const issuedAt = new Date().toISOString();

  const writ = buildWrit(publicKey, issuedAt);
  const writSignature = await sign(writ, secretKey, issuedAt);
  const signedWrit = { ...writ, signature: writSignature };

  const engine = createEngine({
    identity: { engine: "core.writprotocol-engine", version: ENGINE_VERSION, key: publicKey },
    signingKey: secretKey,
    registry: {
      checkoutPath: REGISTRY_PATH,
      baseUrl: "https://registry.writprotocol.dev",
      push: true,
    },
  });

  // Compose a run by hand so the receipt id is stable; record three simulated
  // actions that exercise the writ's full scope, then finalize through the
  // engine so the receipt's structure + signature are real.
  const run = buildRunState(signedWrit, new Date(Date.now() + 1000).toISOString());
  engine.record(run, { action: "core.browser.navigate", target: "https://example.org/", result: "success" });
  engine.record(run, {
    action: "core.form.submit",
    target: "https://example.org/comment/",
    result: "success",
    details: { fields_submitted: { name: "example", message: "demonstration" } },
  });
  engine.record(run, { action: "core.browser.screenshot", target: "https://example.org/", result: "success" });
  const receipt = await engine.finalize(run, "completed");

  const writUrl = engine.publish(signedWrit);
  console.log("published writ:    ", writUrl);
  const receiptUrl = engine.publish(receipt);
  console.log("published receipt: ", receiptUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
