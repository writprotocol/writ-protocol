import { describe, expect, it } from "vitest";
import { Harness } from "../src/index.js";
import { harnessWrit, makeRun, startFormServer, writeContentFile } from "./helpers.js";

describe("Harness", () => {
  it("navigates, fills, and submits through the gated path", async () => {
    const server = await startFormServer();
    try {
      const { engine, run } = await makeRun(harnessWrit(server.host));
      const harness = new Harness(engine, run);

      const nav = await harness.navigate(server.url);
      expect(nav.ok).toBe(true);
      expect(nav.message).toContain("Test Form");

      expect(harness.fill({ name: "Ada Lovelace", message: "Hello from a writ" }).ok).toBe(true);

      const submit = await harness.submit();
      expect(submit.ok).toBe(true);
      const posted = server.lastPostBody();
      expect(posted).toContain("Ada Lovelace");
      expect(posted).toContain("Hello from a writ");

      const receipt = await engine.finalize(run, "completed");
      expect(receipt.actions.map((a) => a.action)).toEqual([
        "core.browser.navigate",
        "core.form.fill",
        "core.form.submit",
      ]);
      expect(receipt.actions.every((a) => a.result === "success")).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("blocks navigation to a domain outside the writ", async () => {
    const server = await startFormServer();
    try {
      const { engine, run } = await makeRun(harnessWrit(server.host));
      const harness = new Harness(engine, run);
      const result = await harness.navigate("http://example.com/");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("blocked by writ");
    } finally {
      await server.close();
    }
  });

  it("reads a file gated by content hash", async () => {
    const { path, hash } = writeContentFile("# Proposal\n");
    const { engine, run } = await makeRun(harnessWrit("127.0.0.1", { path, hash }));
    const harness = new Harness(engine, run);
    const result = harness.fileRead(path);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("# Proposal\n");
  });

  it("blocks a second submission once max_submissions is spent", async () => {
    const server = await startFormServer();
    try {
      const { engine, run } = await makeRun(harnessWrit(server.host));
      const harness = new Harness(engine, run);
      await harness.navigate(server.url);
      expect((await harness.submit()).ok).toBe(true);
      const second = await harness.submit();
      expect(second.ok).toBe(false);
      expect(second.message).toContain("blocked by writ");
    } finally {
      await server.close();
    }
  });

  it("attaches a gated file as a multipart blob", async () => {
    const server = await startFormServer();
    try {
      const { path } = writeContentFile("attachment-content-xyz");
      const writ = harnessWrit(server.host);
      writ.constraints!["core.file.read"] = { paths: [path] };
      const { engine, run } = await makeRun(writ);
      const harness = new Harness(engine, run);
      await harness.navigate(server.url);
      expect(harness.fill({ name: "X", message: "Y", attachment: path }).ok).toBe(true);
      const submit = await harness.submit();
      expect(submit.ok).toBe(true);
      const body = server.lastPostBody()!;
      expect(body).toContain("attachment-content-xyz");
      expect(body).toContain('filename="content.md"');
    } finally {
      await server.close();
    }
  });

  it("records but does not POST in dryrun mode", async () => {
    const server = await startFormServer();
    try {
      const writ = { ...harnessWrit(server.host), mode: "dryrun" as const };
      const { engine, run } = await makeRun(writ);
      const harness = new Harness(engine, run);
      await harness.navigate(server.url);
      harness.fill({ name: "X", message: "Y" });
      const submit = await harness.submit();
      expect(submit.ok).toBe(true);
      expect(submit.message).toContain("dryrun");
      expect(server.lastPostBody()).toBeNull();
    } finally {
      await server.close();
    }
  });
});
