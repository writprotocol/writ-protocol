// The harness core: five gated operations over a writ run. Interface-agnostic —
// the MCP server is a thin adapter over this class.

import type { Engine, RunState } from "@writprotocol/engine";
import { dumpText, fetchHtml } from "./lynx.js";
import { type ParsedForm, parseForm, resolveField } from "./form.js";

/** The outcome of a harness operation; `message` is the agent-facing text. */
export interface OpResult {
  ok: boolean;
  message: string;
}

export class Harness {
  private currentUrl: string | null = null;
  private form: ParsedForm | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly run: RunState,
  ) {}

  /** Read a file, gated by core.file.read (path allowlist + content hash). */
  fileRead(path: string): OpResult {
    const result = this.engine.check(this.run, "core.file.read", path);
    if (!result.allowed) {
      this.engine.record(this.run, {
        action: "core.file.read",
        target: path,
        result: "blocked",
        blockReason: result.reason,
      });
      return blockedResult(result.reason.detail);
    }
    const content = result.content ?? "";
    this.engine.record(this.run, {
      action: "core.file.read",
      target: path,
      result: "success",
      details: {
        bytes_read: Buffer.byteLength(content, "utf8"),
        content_hash_verified: true,
      },
    });
    return { ok: true, message: content };
  }

  /** Fetch a page and parse its form, gated by core.browser.navigate. */
  async navigate(url: string): Promise<OpResult> {
    const result = this.engine.check(this.run, "core.browser.navigate", url);
    if (!result.allowed) {
      this.engine.record(this.run, {
        action: "core.browser.navigate",
        target: url,
        result: "blocked",
        blockReason: result.reason,
      });
      return blockedResult(result.reason.detail);
    }
    let html: string;
    let text: string;
    try {
      html = await fetchHtml(url);
      text = await dumpText(url);
    } catch (e) {
      this.engine.record(this.run, {
        action: "core.browser.navigate",
        target: url,
        result: "failure",
      });
      return { ok: false, message: `navigation failed: ${errorMessage(e)}` };
    }
    this.currentUrl = url;
    this.form = parseForm(html);
    this.engine.record(this.run, {
      action: "core.browser.navigate",
      target: url,
      result: "success",
      details: { form_fields: this.form?.fields.length ?? 0 },
    });
    return { ok: true, message: text };
  }

  /** Set a form field's value in memory, gated by core.form.fill. */
  fill(field: string, value: string): OpResult {
    if (!this.currentUrl || !this.form) {
      return { ok: false, message: "no page loaded; navigate first" };
    }
    const result = this.engine.check(this.run, "core.form.fill", this.currentUrl);
    if (!result.allowed) {
      this.engine.record(this.run, {
        action: "core.form.fill",
        target: this.currentUrl,
        result: "blocked",
        blockReason: result.reason,
      });
      return blockedResult(result.reason.detail);
    }
    const resolved = resolveField(this.form, field);
    if (!resolved) {
      this.engine.record(this.run, {
        action: "core.form.fill",
        target: this.currentUrl,
        result: "failure",
        details: { field },
      });
      return { ok: false, message: `no form field matching "${field}"` };
    }
    resolved.value = value;
    this.engine.record(this.run, {
      action: "core.form.fill",
      target: this.currentUrl,
      result: "success",
      details: { field: resolved.name },
    });
    return { ok: true, message: `filled ${resolved.name}` };
  }

  /** Build and POST the multipart form body, gated by core.form.submit. */
  async submit(): Promise<OpResult> {
    if (!this.currentUrl || !this.form) {
      return { ok: false, message: "no page loaded; navigate first" };
    }
    const target = absoluteUrl(this.form.action, this.currentUrl);
    // v1: check + fetch + record is a TOCTOU window for concurrent callers; sequential MCP clients (v0) are unaffected.
    const result = this.engine.check(this.run, "core.form.submit", target);
    if (!result.allowed) {
      this.engine.record(this.run, {
        action: "core.form.submit",
        target,
        result: "blocked",
        blockReason: result.reason,
      });
      return blockedResult(result.reason.detail);
    }
    const body = new FormData();
    const submitted: Record<string, string> = {};
    for (const f of this.form.fields) {
      body.append(f.name, f.value);
      submitted[f.name] = f.value;
    }
    let status: number;
    let responseText: string;
    try {
      const response = await fetch(target, { method: "POST", body });
      status = response.status;
      responseText = await response.text();
    } catch (e) {
      this.engine.record(this.run, {
        action: "core.form.submit",
        target,
        result: "failure",
        details: { fields_submitted: submitted },
      });
      return { ok: false, message: `submission failed: ${errorMessage(e)}` };
    }
    this.engine.record(this.run, {
      action: "core.form.submit",
      target,
      result: "success",
      details: { fields_submitted: submitted, response_status: status },
    });
    return { ok: status < 400, message: `HTTP ${status}\n\n${responseText}` };
  }

  /** Capture the current page as text, gated by core.browser.screenshot. */
  async screenshot(): Promise<OpResult> {
    if (!this.currentUrl) {
      return { ok: false, message: "no page loaded; navigate first" };
    }
    const result = this.engine.check(this.run, "core.browser.screenshot", this.currentUrl);
    if (!result.allowed) {
      this.engine.record(this.run, {
        action: "core.browser.screenshot",
        target: this.currentUrl,
        result: "blocked",
        blockReason: result.reason,
      });
      return blockedResult(result.reason.detail);
    }
    let text: string;
    try {
      text = await dumpText(this.currentUrl);
    } catch (e) {
      this.engine.record(this.run, {
        action: "core.browser.screenshot",
        target: this.currentUrl,
        result: "failure",
      });
      return { ok: false, message: `screenshot failed: ${errorMessage(e)}` };
    }
    this.engine.record(this.run, {
      action: "core.browser.screenshot",
      target: this.currentUrl,
      result: "success",
      details: { bytes: Buffer.byteLength(text, "utf8") },
    });
    return { ok: true, message: text };
  }
}

function blockedResult(detail: string): OpResult {
  return { ok: false, message: `blocked by writ: ${detail}` };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function absoluteUrl(action: string | null, base: string): string {
  if (!action) return base;
  try {
    return new URL(action, base).toString();
  } catch {
    return action;
  }
}
