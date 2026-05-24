#!/usr/bin/env node
// MCP server: exposes the five gated harness operations as an agent's only tools.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createEngine, ENGINE_VERSION } from "@writprotocol/engine";
import type { EngineConfig } from "@writprotocol/engine";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Harness, type HarnessOptions, type OpResult } from "./harness.js";

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
      baseUrl: process.env["WRIT_REGISTRY_URL"] ?? "https://registry.writprotocol.dev",
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

function loadHarnessOptions(engineConfig: EngineConfig): HarnessOptions {
  const options: HarnessOptions = {};
  if (engineConfig.registry) options.registryBaseUrl = engineConfig.registry.baseUrl;
  const templatePath = process.env["WRIT_DISCLOSURE_TEMPLATE_PATH"];
  if (templatePath) {
    if (!existsSync(templatePath)) {
      throw new Error(`WRIT_DISCLOSURE_TEMPLATE_PATH points to a missing file: ${templatePath}`);
    }
    options.disclosureTemplate = readFileSync(templatePath, "utf8");
  }
  return options;
}

async function main(): Promise<void> {
  const { writPath, engine: engineConfig } = loadConfig();
  // Load harness options BEFORE startRun so a misconfigured disclosure
  // template doesn't leave a published pending receipt placeholder behind.
  const harnessOptions = loadHarnessOptions(engineConfig);
  const engine = createEngine(engineConfig);
  const run = engine.startRun(await engine.loadWrit(writPath));
  const harness = new Harness(engine, run, harnessOptions);

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
      description: "Fill the loaded form's fields. Provide a map from field name or aria-label to value. For file fields, the value is an absolute path.",
      inputSchema: {
        fields: z.record(z.string(), z.string()).describe("map of field name or label to value"),
      },
    },
    ({ fields }) => toToolResult(harness.fill(fields)),
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

  server.registerTool(
    "get_disclosure",
    {
      description:
        "Get the disclosure narrative for embedding in the outgoing action (e.g. a form field). Returns a text block with the writ and receipt URLs already filled in, suitable for direct use in form_fill.",
    },
    () => toToolResult(harness.disclosure()),
  );

  // Finalize when the MCP client closes the stdio pipe, or on signal.
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
  const finishAndExit = (): void => void finish().then(() => process.exit(0));
  process.stdin.on("end", finishAndExit);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, finishAndExit);
  }

  await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
  process.stderr.write(`writ-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
