// Fetching pages via the lynx text browser, invoked as a subprocess.

import { spawn } from "node:child_process";

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/** Fetch the raw HTML source of a URL. */
export function fetchHtml(url: string): Promise<string> {
  return runLynx(["-source", url]);
}

/** Fetch the rendered, human-readable text of a URL. */
export function dumpText(url: string): Promise<string> {
  return runLynx(["-dump", "-nolist", url]);
}

function runLynx(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // stdin from /dev/null so lynx never blocks waiting on interactive input.
    const child = spawn("lynx", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => reject(new Error(`lynx timed out after ${TIMEOUT_MS}ms`)));
    }, TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BUFFER) {
        child.kill("SIGKILL");
        settle(() => reject(new Error("lynx output exceeded the buffer limit")));
        return;
      }
      chunks.push(chunk);
    });
    child.on("error", (e) => settle(() => reject(e)));
    child.on("close", (code) =>
      settle(() => {
        if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
        else reject(new Error(`lynx exited with code ${code ?? "unknown"}`));
      }),
    );
  });
}
