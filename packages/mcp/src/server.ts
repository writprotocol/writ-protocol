#!/usr/bin/env node
// MCP server: exposes the five gated harness operations as an agent's only tools.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createEngine, ENGINE_VERSION } from "@writprotocol/engine";
import type { EngineConfig } from "@writprotocol/engine";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { Harness, type OpResult } from "./harness.js";

/** Key file format written by the keypair generation step. */
interface KeyFile {
  secret_key: string;
  public_key: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

function loadConfig(): { writPath: string; engine: EngineConfig } {
  const keyFile = JSON.parse(readFileSync(requireEnv("WRIT_KEY_PATH"), "utf8")) as KeyFile;
  const engine: EngineConfig = {
    identity: {
      engine: "core.writprotocol-engine",
      version: ENGINE_VERSION,
      key: keyFile.public_key,
    },
    signingKey: new Uint8Array(Buffer.from(keyFile.secret_key, "base64")),
  };
  const registryPath = process.env["WRIT_REGISTRY"];
  if (registryPath) {
    engine.registry = {
      checkoutPath: registryPath,
      baseUrl: process.env["WRIT_REGISTRY_URL"] ?? "https://writprotocol.dev/registry",
      push: process.env["WRIT_REGISTRY_PUSH"] === "true",
    };
  }
  return { writPath: requireEnv("WRIT_PATH"), engine };
}

function toToolResult(result: OpResult): CallToolResult {
  return {
    content: [{ type: "text", text: result.message }],
    isError: !result.ok,
  };
}

async function main(): Promise<void> {
  const { writPath, engine: engineConfig } = loadConfig();
  const engine = createEngine(engineConfig);
  const run = engine.startRun(await engine.loadWrit(writPath));
  const harness = new Harness(engine, run);

  const server = new McpServer({ name: "writ-mcp", version: "0.1.0" });

  server.registerTool(
    "file_read",
    {
      description: "Read a file authorized by the writ.",
      inputSchema: { path: z.string().describe("absolute path of the file to read") },
    },
    ({ path }) => toToolResult(harness.fileRead(path)),
  );

  server.registerTool(
    "browser_navigate",
    {
      description: "Navigate to a URL and load its form.",
      inputSchema: { url: z.string().describe("the URL to navigate to") },
    },
    async ({ url }) => toToolResult(await harness.navigate(url)),
  );

  server.registerTool(
    "form_fill",
    {
      description: "Fill a field of the loaded form.",
      inputSchema: {
        field: z.string().describe("field name or label"),
        value: z.string().describe("value to fill in"),
      },
    },
    ({ field, value }) => toToolResult(harness.fill(field, value)),
  );

  server.registerTool(
    "form_submit",
    { description: "Submit the loaded form." },
    async () => toToolResult(await harness.submit()),
  );

  server.registerTool(
    "browser_screenshot",
    { description: "Capture the current page as text." },
    async () => toToolResult(await harness.screenshot()),
  );

  // Finalize on shutdown. Stdin-close handling is refined for the end-to-end run.
  let finalized = false;
  const finish = async (): Promise<void> => {
    if (finalized) return;
    finalized = true;
    try {
      const receipt = await engine.finalize(run, "completed");
      if (engineConfig.registry) engine.publish(receipt);
    } catch {
      // best-effort finalization
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => void finish().then(() => process.exit(0)));
  }

  await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
  process.stderr.write(`writ-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
