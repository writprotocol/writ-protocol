// Test helpers: temp directories, throwaway registry repos, engine config, fixtures.

import { generateKeyPair } from "@writprotocol/core";
import type { Writ } from "@writprotocol/core";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineConfig, RegistryConfig } from "../src/index.js";

export function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "writ-test-"));
}

/** A temp directory initialized as a git repo, usable as a registry checkout. */
export function initRegistry(): RegistryConfig {
  const checkoutPath = tmpDir();
  execFileSync("git", ["init", "-q"], { cwd: checkoutPath });
  return { checkoutPath, baseUrl: "https://registry.writprotocol.dev", push: false };
}

/** An engine config with a fresh keypair, optionally bound to a registry. */
export async function makeConfig(registry?: RegistryConfig): Promise<EngineConfig> {
  const kp = await generateKeyPair();
  const config: EngineConfig = {
    identity: { engine: "core.writprotocol-engine", version: "0.1.0", key: kp.publicKeyString },
    signingKey: kp.secretKey,
  };
  if (registry) config.registry = registry;
  return config;
}

/** Write content to a temp file; return its path and "sha256:<hex>" hash. */
export function writeContentFile(content: string): { path: string; hash: string } {
  const path = join(tmpDir(), "content.md");
  writeFileSync(path, content, "utf8");
  const hash = "sha256:" + createHash("sha256").update(content, "utf8").digest("hex");
  return { path, hash };
}

/** A fresh, structurally valid writ covering the v0 core action vocabulary. */
export function sampleWrit(): Writ {
  return {
    protocol: "writ/v0",
    id: "writ_nl5k2c",
    mode: "live",
    issued_by: {
      handle: "@ilkka",
      identities: [
        { type: "email", value: "ilkka@writprotocol.dev", attestation: { method: "self" } },
      ],
      key: "ed25519:GLb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=",
    },
    delegate: { type: "agent", id: "agent:claude-code" },
    task: "Submit the example application.",
    scope: [
      "core.file.read",
      "core.browser.navigate",
      "core.form.fill",
      "core.form.submit",
      "core.browser.screenshot",
    ],
    constraints: {
      "core.browser.navigate": { domains: ["example.org"] },
      "core.form.fill": { domains: ["example.org"] },
      "core.form.submit": { domains: ["example.org"], max_submissions: 1 },
      "core.browser.screenshot": { domains: ["example.org"] },
    },
    issued_at: "2026-05-28T14:32:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    status: "active",
    revision: 1,
  };
}
