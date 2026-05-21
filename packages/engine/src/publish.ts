// Publishing signed artifacts to a registry: write canonical JSON, commit, push.

import { canonicalJSON } from "@writprotocol/core";
import type { Receipt, Writ } from "@writprotocol/core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RegistryConfig } from "./types.js";

/** Write an artifact into the registry checkout, commit it, and return its public URL. */
export function publish(registry: RegistryConfig, artifact: Writ | Receipt): string {
  const relPath = artifactPath(artifact);
  const absPath = join(registry.checkoutPath, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, canonicalJSON(artifact) + "\n", "utf8");

  git(registry.checkoutPath, ["add", relPath]);
  git(registry.checkoutPath, ["commit", "-m", `Publish ${artifact.id}`]);
  if (registry.push) {
    git(registry.checkoutPath, ["push"]);
  }
  return `${registry.baseUrl.replace(/\/+$/, "")}/${relPath}`;
}

function artifactPath(artifact: Writ | Receipt): string {
  if (artifact.id.startsWith("writ_")) return `writ/${artifact.id}.json`;
  if (artifact.id.startsWith("receipt_")) return `receipt/${artifact.id}.json`;
  throw new Error(`publish: unrecognized artifact id "${artifact.id}"`);
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}
