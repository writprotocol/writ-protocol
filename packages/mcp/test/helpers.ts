// Test helpers: engine runs, harness writs, a local form server, content files.

import { generateKeyPair } from "@writprotocol/core";
import type { Writ } from "@writprotocol/core";
import { createEngine } from "@writprotocol/engine";
import type { Engine, RunState } from "@writprotocol/engine";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** An engine and a started run, backed by a fresh keypair. */
export async function makeRun(writ: Writ): Promise<{ engine: Engine; run: RunState }> {
  const kp = await generateKeyPair();
  const engine = createEngine({
    identity: { engine: "core.writprotocol-engine", version: "0.1.0", key: kp.publicKeyString },
    signingKey: kp.secretKey,
  });
  return { engine, run: engine.startRun(writ) };
}

/** A writ scoped to the v0 actions, constrained to one host (and optionally one file). */
export function harnessWrit(host: string, file?: { path: string; hash: string }): Writ {
  const writ: Writ = {
    protocol: "writ/v0",
    id: "writ_harness1",
    mode: "live",
    issued_by: {
      handle: "@test",
      identities: [{ type: "email", value: "test@writprotocol.dev" }],
      key: "ed25519:dGVzdGtleQ==",
    },
    delegate: { type: "agent", id: "agent:claude-code" },
    task: "harness smoke test",
    scope: [
      "core.file.read",
      "core.browser.navigate",
      "core.form.fill",
      "core.form.submit",
      "core.browser.screenshot",
    ],
    constraints: {
      "core.browser.navigate": { domains: [host] },
      "core.form.fill": { domains: [host] },
      "core.form.submit": { domains: [host], max_submissions: 1 },
      "core.browser.screenshot": { domains: [host] },
    },
    issued_at: "2026-05-22T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    status: "active",
    revision: 1,
  };
  if (file) {
    writ.constraints!["core.file.read"] = { paths: [{ path: file.path, content_hash: file.hash }] };
  }
  return writ;
}

/** Write content to a temp file; return its path and "sha256:<hex>" hash. */
export function writeContentFile(content: string): { path: string; hash: string } {
  const path = join(mkdtempSync(join(tmpdir(), "writ-mcp-")), "content.md");
  writeFileSync(path, content, "utf8");
  return { path, hash: "sha256:" + createHash("sha256").update(content, "utf8").digest("hex") };
}

const FORM_HTML = `<!DOCTYPE html>
<html><body>
<h1>Test Form</h1>
<form action="/submit" method="post">
  <label for="n">Name</label>
  <input id="n" name="name" type="text" value="">
  <label for="m">Message</label>
  <textarea id="m" name="message"></textarea>
  <label for="a">Attachment</label>
  <input id="a" name="attachment" type="file" aria-label="Attachment">
  <input type="submit" name="send" value="Send">
</form>
</body></html>`;

export interface FormServer {
  url: string;
  host: string;
  lastPostBody: () => string | null;
  close: () => Promise<void>;
}

/** A local HTTP server that serves a form on GET and captures the POST body. */
export async function startFormServer(): Promise<FormServer> {
  let lastBody: string | null = null;
  const server = createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        lastBody = body;
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body><h1>Submission received</h1></body></html>");
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(FORM_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    host: "127.0.0.1",
    lastPostBody: () => lastBody,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
