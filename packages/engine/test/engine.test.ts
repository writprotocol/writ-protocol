import {
  sign,
  validateReceipt,
  validateReceiptAgainstWrit,
  verify,
  type Receipt,
} from "@writprotocol/core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine } from "../src/index.js";
import { initRegistry, makeConfig, sampleWrit, tmpDir, writeContentFile } from "./helpers.js";

describe("loadWrit", () => {
  it("loads a valid writ from disk", async () => {
    const engine = createEngine(await makeConfig());
    const path = join(tmpDir(), "writ.json");
    writeFileSync(path, JSON.stringify(sampleWrit()), "utf8");
    expect((await engine.loadWrit(path)).id).toBe("writ_nl5k2c");
  });

  it("throws on a structurally invalid writ", async () => {
    const engine = createEngine(await makeConfig());
    const path = join(tmpDir(), "bad.json");
    writeFileSync(path, JSON.stringify({ protocol: "writ/v0" }), "utf8");
    await expect(engine.loadWrit(path)).rejects.toThrow(/invalid writ/);
  });

  it("throws on a writ in a dead state", async () => {
    const engine = createEngine(await makeConfig());
    const path = join(tmpDir(), "done.json");
    writeFileSync(path, JSON.stringify({ ...sampleWrit(), status: "completed" }), "utf8");
    await expect(engine.loadWrit(path)).rejects.toThrow(/completed/);
  });
});

describe("startRun", () => {
  it("mints a receipt id and initializes empty state", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    expect(run.receiptId).toMatch(/^receipt_[a-z0-9]{6,}$/);
    expect(run.actions).toEqual([]);
    expect(run.receiptUrl).toBeUndefined();
  });

  it("reserves a pending receipt when a registry is configured", async () => {
    const registry = initRegistry();
    const engine = createEngine(await makeConfig(registry));
    const run = engine.startRun(sampleWrit());
    expect(run.receiptUrl).toBe(
      `https://registry.writprotocol.dev/receipt/${run.receiptId}.json`,
    );
    const file = join(registry.checkoutPath, "receipt", `${run.receiptId}.json`);
    expect(existsSync(file)).toBe(true);
    const placeholder = JSON.parse(readFileSync(file, "utf8")) as Receipt;
    expect(placeholder.status).toBe("pending");
    expect(validateReceipt(placeholder)).toEqual({ valid: true, errors: [] });
  });
});

describe("check", () => {
  it("allows an in-scope action with satisfied constraints", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    expect(engine.check(run, "core.browser.navigate", "https://example.org/propose/")).toEqual({
      allowed: true,
    });
  });

  it("blocks an action outside the writ's scope", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    const result = engine.check(run, "core.email.send", "x");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("scope_violation");
  });

  it("blocks when the writ has expired", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun({ ...sampleWrit(), expires_at: "2020-01-01T00:00:00Z" });
    const result = engine.check(run, "core.browser.navigate", "https://example.org/");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("writ_expired");
  });

  it("blocks when the writ has been revoked", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun({ ...sampleWrit(), status: "revoked" });
    const result = engine.check(run, "core.browser.navigate", "https://example.org/");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("writ_revoked");
  });

  it("blocks navigation to a domain outside the constraint", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    const result = engine.check(run, "core.browser.navigate", "https://evil.example/");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("constraint_violation");
  });

  it("allows a subdomain of a constrained domain", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    expect(engine.check(run, "core.browser.navigate", "https://www.example.org/").allowed).toBe(true);
  });

  it("reads the file and verifies its content hash on allow", async () => {
    const engine = createEngine(await makeConfig());
    const { path, hash } = writeContentFile("# Proposal\n");
    const writ = sampleWrit();
    writ.constraints!["core.file.read"] = { paths: [{ path, content_hash: hash }] };
    const run = engine.startRun(writ);
    const result = engine.check(run, "core.file.read", path);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(new TextDecoder().decode(result.content!)).toBe("# Proposal\n");
      expect(result.content_hash_verified).toBe(true);
    }
  });

  it("blocks a file read whose path is not allowed", async () => {
    const engine = createEngine(await makeConfig());
    const { path } = writeContentFile("x");
    const writ = sampleWrit();
    writ.constraints!["core.file.read"] = { paths: ["/some/other/path.md"] };
    const run = engine.startRun(writ);
    const result = engine.check(run, "core.file.read", path);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("constraint_violation");
  });

  it("blocks a file read whose content hash does not match", async () => {
    const engine = createEngine(await makeConfig());
    const { path } = writeContentFile("real content");
    const writ = sampleWrit();
    writ.constraints!["core.file.read"] = {
      paths: [{ path, content_hash: `sha256:${"0".repeat(64)}` }],
    };
    const run = engine.startRun(writ);
    const result = engine.check(run, "core.file.read", path);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("constraint_violation");
  });

  it("blocks a submission once max_submissions is reached", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    expect(engine.check(run, "core.form.submit", "https://example.org/propose/").allowed).toBe(true);
    engine.record(run, {
      action: "core.form.submit",
      target: "https://example.org/propose/",
      result: "success",
    });
    const result = engine.check(run, "core.form.submit", "https://example.org/propose/");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("token_exhausted");
  });
});

describe("record", () => {
  it("appends a well-formed action entry", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    const entry = engine.record(run, {
      action: "core.browser.navigate",
      target: "https://example.org/propose/",
      result: "success",
    });
    expect(entry.sequence).toBe(1);
    expect(entry.irreversible).toBe(false);
    expect(entry.undo_available).toBe(false);
    expect(entry.undo_unavailable_reason).toBe("engine_does_not_support");
    expect(entry.token_consumed).toBe(false);
    expect(run.actions).toHaveLength(1);
  });

  it("marks an irreversible submit and consumes a token", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    const entry = engine.record(run, {
      action: "core.form.submit",
      target: "https://example.org/propose/",
      result: "success",
    });
    expect(entry.irreversible).toBe(true);
    expect(entry.token_consumed).toBe(true);
    expect(entry.undo_unavailable_reason).toBeUndefined();
  });

  it("records a blocked action with its block reason", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    const entry = engine.record(run, {
      action: "core.email.send",
      result: "blocked",
      blockReason: { rule: "scope_violation", detail: "not in scope" },
    });
    expect(entry.result).toBe("blocked");
    expect(entry.block_reason).toEqual({ rule: "scope_violation", detail: "not in scope" });
  });
});

describe("finalize", () => {
  it("produces a signed receipt that validates and verifies", async () => {
    const config = await makeConfig();
    const engine = createEngine(config);
    const writ = sampleWrit();
    const run = engine.startRun(writ);
    engine.record(run, {
      action: "core.browser.navigate",
      target: "https://example.org/propose/",
      result: "success",
    });
    const receipt = await engine.finalize(run, "completed");
    expect(receipt.status).toBe("completed");
    expect(validateReceipt(receipt)).toEqual({ valid: true, errors: [] });
    expect(validateReceiptAgainstWrit(receipt, writ)).toEqual({ valid: true, errors: [] });
    expect(await verify(receipt, config.identity.key)).toBe(true);
  });

  it("maps a completed dryrun run to dryrun_completed", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun({ ...sampleWrit(), mode: "dryrun" });
    const receipt = await engine.finalize(run, "completed");
    expect(receipt.status).toBe("dryrun_completed");
  });

  it("throws when finalized twice", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    await engine.finalize(run, "completed");
    await expect(engine.finalize(run, "completed")).rejects.toThrow(/already finalized/);
  });
});

describe("publish", () => {
  it("writes a canonical artifact to the registry and returns its URL", async () => {
    const registry = initRegistry();
    const engine = createEngine(await makeConfig(registry));
    const url = engine.publish(sampleWrit());
    expect(url).toBe("https://registry.writprotocol.dev/writ/writ_nl5k2c.json");
    const file = join(registry.checkoutPath, "writ", "writ_nl5k2c.json");
    expect(JSON.parse(readFileSync(file, "utf8")).id).toBe("writ_nl5k2c");
  });
});

describe("hardening fixes", () => {
  it("verifies the writ signature when present and rejects a tampered one (P1)", async () => {
    const config = await makeConfig();
    const engine = createEngine(config);
    const base = sampleWrit();
    base.issued_by.key = config.identity.key;
    const signature = await sign(base, config.signingKey, "2026-05-28T14:32:00Z");
    const signed = { ...base, signature };
    const tampered = { ...signed, task: "Different task" };
    const goodPath = join(tmpDir(), "good.json");
    const badPath = join(tmpDir(), "bad.json");
    writeFileSync(goodPath, JSON.stringify(signed), "utf8");
    writeFileSync(badPath, JSON.stringify(tampered), "utf8");
    expect((await engine.loadWrit(goodPath)).id).toBe(signed.id);
    await expect(engine.loadWrit(badPath)).rejects.toThrow(/signature/);
  });

  it("blocks file.read when no paths constraint is set (P1)", async () => {
    const engine = createEngine(await makeConfig());
    const run = engine.startRun(sampleWrit());
    const result = engine.check(run, "core.file.read", "/some/path");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("constraint_violation");
  });

  it("blocks navigation when no domains constraint is set (P1)", async () => {
    const engine = createEngine(await makeConfig());
    const writ = sampleWrit();
    delete writ.constraints!["core.browser.navigate"];
    const run = engine.startRun(writ);
    const result = engine.check(run, "core.browser.navigate", "https://example.com/");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.rule).toBe("constraint_violation");
  });

  it("rejects an artifact id with path separators (P2)", async () => {
    const registry = initRegistry();
    const engine = createEngine(await makeConfig(registry));
    const bad = { ...sampleWrit(), id: "writ_../../escape" };
    expect(() => engine.publish(bad)).toThrow(/invalid artifact id/);
  });
});
