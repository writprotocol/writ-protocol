// Parsing an HTML form into an in-memory, fillable field model.

import { type HTMLElement, parse } from "node-html-parser";

export interface FormField {
  name: string;
  type: string;
  value: string;
  label?: string;
}

export interface ParsedForm {
  /** The form's `action` URL, or null when it submits to the same page. */
  action: string | null;
  method: string;
  fields: FormField[];
}

const SKIP_TYPES = new Set(["submit", "button", "reset", "image", "file"]);

/** Parse the first <form> in an HTML document. Returns null if there is none. */
export function parseForm(html: string): ParsedForm | null {
  const form = parse(html).querySelector("form");
  if (!form) return null;
  const fields: FormField[] = [];
  for (const el of form.querySelectorAll("input, textarea, select")) {
    const name = el.getAttribute("name");
    if (!name) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? tag).toLowerCase();
    if (SKIP_TYPES.has(type)) continue;
    const value = el.getAttribute("value") ?? (tag === "textarea" ? el.text : "");
    fields.push({ name, type, value, label: findLabel(form, el) });
  }
  return {
    action: form.getAttribute("action") ?? null,
    method: (form.getAttribute("method") ?? "GET").toUpperCase(),
    fields,
  };
}

/** Find a field by exact name, case-insensitive name, or label text. */
export function resolveField(form: ParsedForm, key: string): FormField | undefined {
  const lower = key.toLowerCase();
  return (
    form.fields.find((f) => f.name === key) ??
    form.fields.find((f) => f.name.toLowerCase() === lower) ??
    form.fields.find((f) => f.label?.toLowerCase() === lower)
  );
}

function findLabel(form: HTMLElement, el: HTMLElement): string | undefined {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const id = el.getAttribute("id");
  if (id) {
    const label = form.querySelector(`label[for="${id}"]`);
    if (label) return label.text.trim();
  }
  return undefined;
}
