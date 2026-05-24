// The harness core: five gated operations over a writ run. Interface-agnostic —
// the MCP server is a thin adapter over this class.

import type { Engine, RunState } from "@writprotocol/engine";
import { basename } from "node:path";
import { dumpText, fetchHtml } from "./lynx.js";
import { type FormField, type ParsedForm, parseForm, resolveField } from "./form.js";

/** The outcome of a harness operation; `message` is the agent-facing text. */
export interface OpResult {
  ok: boolean;
  message: string;
}

/** Optional configuration for harness features not tied to the writ itself. */
export interface HarnessOptions {
  /** Template for the disclosure narrative; supports {{writ_url}} and {{receipt_url}}. */
  disclosureTemplate?: string;
  /** Public registry base URL, e.g. "https://registry.writprotocol.dev" — needed to render disclosure URLs. */
  registryBaseUrl?: string;
}

export class Harness {
  private currentUrl: string | null = null;
  private form: ParsedForm | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly run: RunState,
    private readonly options: HarnessOptions = {},
  ) {}

  /** Compose the disclosure narrative for embedding in an outgoing action.
   *
   * The template's `{{writ_url}}` and `{{receipt_url}}` placeholders are
   * substituted with the run's published URLs. The result is the text the
   * agent should embed in the receiving action (e.g. as the value of a
   * form field) so the receiver can traverse back to the authority chain.
   *
   * v0: template and base URL come from harness configuration. v1 reserves
   * `writ.disclosure_template` so the writ itself binds the disclosure shape.
   */
  disclosure(): OpResult {
    if (!this.options.disclosureTemplate) {
      return { ok: false, message: "no disclosure template configured" };
    }
    if (!this.options.registryBaseUrl) {
      return { ok: false, message: "no registry base URL configured" };
    }
    const base = this.options.registryBaseUrl.replace(/\/$/, ""); // tolerate a trailing slash
    const writUrl = `${base}/writ/${this.run.writ.id}.json`;
    const receiptUrl = `${base}/receipt/${this.run.receiptId}.json`;
    const text = this.options.disclosureTemplate
      .replaceAll("{{writ_url}}", writUrl)
      .replaceAll("{{receipt_url}}", receiptUrl);
    return { ok: true, message: text };
  }

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
    const bytes = result.content ?? new Uint8Array(0);
    const text = new TextDecoder("utf-8").decode(bytes);
    this.engine.record(this.run, {
      action: "core.file.read",
      target: path,
      result: "success",
      details: {
        bytes_read: bytes.length,
        content_hash_verified: result.content_hash_verified ?? false,
      },
    });
    return { ok: true, message: text };
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

  /** Set multiple form fields' values in memory, gated by core.form.fill. */
  fill(values: Record<string, string>): OpResult {
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
    const resolved: Array<{ field: FormField; value: string }> = [];
    const unresolved: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      const field = resolveField(this.form, key);
      if (field) resolved.push({ field, value });
      else unresolved.push(key);
    }
    if (unresolved.length > 0) {
      this.engine.record(this.run, {
        action: "core.form.fill",
        target: this.currentUrl,
        result: "failure",
        details: { unresolved },
      });
      return { ok: false, message: `unresolved fields: ${unresolved.join(", ")}` };
    }
    for (const { field, value } of resolved) {
      field.value = value;
    }
    this.engine.record(this.run, {
      action: "core.form.fill",
      target: this.currentUrl,
      result: "success",
      details: {
        fields_filled: resolved.length,
        field_names: resolved.map((r) => r.field.name),
      },
    });
    return { ok: true, message: `filled ${resolved.length} fields` };
  }

  /** Build and POST the multipart form body, gated by core.form.submit. In dryrun mode the POST is recorded but not sent. */
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
    // Resolve attachments via gated file reads.
    const attachments: Array<{ field: string; bytes: Uint8Array; filename: string }> = [];
    for (const field of this.form.fields) {
      if (field.type !== "file" || !field.value) continue;
      const path = field.value;
      const fileResult = this.engine.check(this.run, "core.file.read", path);
      if (!fileResult.allowed) {
        this.engine.record(this.run, {
          action: "core.file.read",
          target: path,
          result: "blocked",
          blockReason: fileResult.reason,
        });
        this.engine.record(this.run, {
          action: "core.form.submit",
          target,
          result: "failure",
          details: { attachment_failed: field.name, reason: fileResult.reason.detail },
        });
        return { ok: false, message: `attachment ${field.name} blocked: ${fileResult.reason.detail}` };
      }
      const bytes = fileResult.content ?? new Uint8Array(0);
      this.engine.record(this.run, {
        action: "core.file.read",
        target: path,
        result: "success",
        details: {
          bytes_read: bytes.length,
          content_hash_verified: fileResult.content_hash_verified ?? false,
        },
      });
      attachments.push({ field: field.name, bytes, filename: basename(path) });
    }
    // Build the multipart body.
    const body = new FormData();
    const submitted: Record<string, string> = {};
    for (const field of this.form.fields) {
      if (field.type === "file") continue;
      body.append(field.name, field.value);
      submitted[field.name] = field.value;
    }
    for (const a of attachments) {
      body.append(a.field, new Blob([a.bytes]), a.filename);
    }
    const attachmentDetails = attachments.map((a) => ({
      field: a.field,
      filename: a.filename,
      bytes: a.bytes.length,
    }));
    // Dryrun mode — record the constructed POST but do not send it.
    if (this.run.writ.mode === "dryrun") {
      this.engine.record(this.run, {
        action: "core.form.submit",
        target,
        result: "success",
        details: {
          fields_submitted: submitted,
          attachments_submitted: attachmentDetails,
          dryrun: true,
        },
      });
      return {
        ok: true,
        message: `dryrun: would POST ${Object.keys(submitted).length} fields and ${attachments.length} attachments to ${target}`,
      };
    }
    // Live mode — POST.
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
        details: { fields_submitted: submitted, attachments_submitted: attachmentDetails },
      });
      return { ok: false, message: `submission failed: ${errorMessage(e)}` };
    }
    this.engine.record(this.run, {
      action: "core.form.submit",
      target,
      result: "success",
      details: {
        fields_submitted: submitted,
        attachments_submitted: attachmentDetails,
        response_status: status,
      },
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
