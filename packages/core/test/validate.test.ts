import { describe, expect, it } from "vitest";
import {
  validateReceipt,
  validateReceiptAgainstWrit,
  validateWrit,
  type ActionEntry,
  type Receipt,
  type Writ,
} from "../src/index.js";
import { pendingReceipt, validReceipt, validWrit } from "./fixtures.js";

describe("validateWrit", () => {
  it("accepts a well-formed writ", () => {
    expect(validateWrit(validWrit())).toEqual({ valid: true, errors: [] });
  });

  it("rejects non-objects", () => {
    expect(validateWrit(null).valid).toBe(false);
    expect(validateWrit("writ").valid).toBe(false);
  });

  it("rejects a wrong protocol (R1)", () => {
    const result = validateWrit({ ...validWrit(), protocol: "writ/v2" });
    expect(result.errors.some((e) => e.rule === "protocol")).toBe(true);
  });

  it("rejects a malformed id (R2)", () => {
    const result = validateWrit({ ...validWrit(), id: "writ_ABC" });
    expect(result.errors.some((e) => e.rule === "id_pattern")).toBe(true);
  });

  it("rejects a missing required field (R3)", () => {
    const writ = validWrit();
    delete (writ as Partial<Writ>).task;
    expect(validateWrit(writ).errors.some((e) => e.path === "task")).toBe(true);
  });

  it("rejects an invalid mode (R3)", () => {
    const result = validateWrit({ ...validWrit(), mode: "test" });
    expect(result.errors.some((e) => e.path === "mode")).toBe(true);
  });

  it("rejects a malformed action identifier in scope (R4)", () => {
    const result = validateWrit({ ...validWrit(), scope: ["core.file.read", "twosegment.bad"] });
    expect(result.errors.some((e) => e.rule === "action_pattern")).toBe(true);
  });

  it("rejects duplicate scope entries (R4)", () => {
    const result = validateWrit({ ...validWrit(), scope: ["core.file.read", "core.file.read"] });
    expect(result.errors.some((e) => e.rule === "scope_unique")).toBe(true);
  });

  it("rejects an empty scope (R4)", () => {
    const result = validateWrit({ ...validWrit(), scope: [] });
    expect(result.errors.some((e) => e.path === "scope")).toBe(true);
  });

  it("rejects a constraint key not in scope (R5)", () => {
    const writ = validWrit();
    writ.constraints = { "core.email.send": { domains: ["example.org"] } };
    expect(validateWrit(writ).errors.some((e) => e.rule === "constraints_subset")).toBe(true);
  });

  it("rejects a malformed extension key (R10)", () => {
    const writ = validWrit();
    writ.extensions = { nodot: { x: 1 } };
    expect(validateWrit(writ).errors.some((e) => e.rule === "extension_key")).toBe(true);
  });

  it("accepts an unsigned writ but checks signature shape when present (R9)", () => {
    const writ = validWrit();
    (writ as Record<string, unknown>).signature = { algorithm: "rsa", value: "x", signed_at: "t" };
    expect(validateWrit(writ).errors.some((e) => e.rule === "signature")).toBe(true);
  });

  it("rejects non-ISO expires_at values (R3)", () => {
    for (const bad of ["not-a-date", "05/28/2026", "1", "2026-05-28", "2026-02-31T00:00:00Z"]) {
      const result = validateWrit({ ...validWrit(), expires_at: bad });
      expect(
        result.errors.some((e) => e.path === "expires_at"),
        `should reject "${bad}"`,
      ).toBe(true);
    }
  });

  it("accepts a reserved disclosure_template string but rejects a non-string", () => {
    const ok = validWrit();
    ok.disclosure_template = "Performed under {{writ_url}}, recorded at {{receipt_url}}.";
    expect(validateWrit(ok).valid).toBe(true);
    const bad = { ...validWrit(), disclosure_template: 42 };
    expect(validateWrit(bad).errors.some((e) => e.path === "disclosure_template")).toBe(true);
  });
});

describe("validateReceipt", () => {
  it("accepts a well-formed receipt", () => {
    expect(validateReceipt(validReceipt())).toEqual({ valid: true, errors: [] });
  });

  it("accepts a pending receipt with no completed_at", () => {
    expect(validateReceipt(pendingReceipt())).toEqual({ valid: true, errors: [] });
  });

  it("requires completed_at when status is not pending (R3)", () => {
    const receipt = validReceipt();
    delete receipt.completed_at;
    expect(validateReceipt(receipt).errors.some((e) => e.path === "completed_at")).toBe(true);
  });

  it("rejects a malformed id (R2)", () => {
    const result = validateReceipt({ ...validReceipt(), id: "rcpt_1" });
    expect(result.errors.some((e) => e.rule === "id_pattern")).toBe(true);
  });

  it("requires block_reason when an action is blocked (R8)", () => {
    const receipt = validReceipt();
    receipt.actions[0]!.result = "blocked";
    expect(validateReceipt(receipt).errors.some((e) => e.rule === "block_reason")).toBe(true);
  });

  it("accepts a blocked action carrying a valid block_reason (R8)", () => {
    const receipt = validReceipt();
    receipt.actions[0]!.result = "blocked";
    receipt.actions[0]!.block_reason = {
      rule: "scope_violation",
      detail: "core.calendar.create not in writ scope",
    };
    expect(validateReceipt(receipt).valid).toBe(true);
  });

  it("rejects undo_available true on an irreversible action (R7)", () => {
    const receipt = validReceipt();
    receipt.actions[1]!.undo_available = true;
    expect(validateReceipt(receipt).errors.some((e) => e.rule === "reversibility")).toBe(true);
  });

  it("rejects a missing required array (R3)", () => {
    const receipt = validReceipt();
    delete (receipt as Partial<Receipt>).delegations;
    expect(validateReceipt(receipt).errors.some((e) => e.path === "delegations")).toBe(true);
  });

  it("requires the per-action signature field even when null", () => {
    const receipt = validReceipt();
    delete (receipt.actions[0] as Partial<ActionEntry>).signature;
    expect(
      validateReceipt(receipt).errors.some((e) => e.path === "actions[0].signature"),
    ).toBe(true);
  });

  it("rejects non-ISO receipt datetimes", () => {
    expect(
      validateReceipt({ ...validReceipt(), started_at: "not-a-date" }).errors.some(
        (e) => e.path === "started_at",
      ),
    ).toBe(true);
    expect(
      validateReceipt({ ...validReceipt(), completed_at: "2026-05-28" }).errors.some(
        (e) => e.path === "completed_at",
      ),
    ).toBe(true);
    const badTimestamp = validReceipt();
    badTimestamp.actions[0]!.timestamp = "yesterday";
    expect(
      validateReceipt(badTimestamp).errors.some((e) => e.path === "actions[0].timestamp"),
    ).toBe(true);
  });

  it("accepts a reserved disclosures array but rejects a non-array", () => {
    const ok = validReceipt();
    ok.disclosures = [
      {
        location: "form_field:ai_prompt",
        channel: "https://example.org/propose/",
        content: "Performed under https://r/writ/w.json, recorded at https://r/receipt/r.json.",
      },
    ];
    expect(validateReceipt(ok).valid).toBe(true);
    const bad = { ...validReceipt(), disclosures: "nope" };
    expect(validateReceipt(bad).errors.some((e) => e.path === "disclosures")).toBe(true);
  });

  it("rejects malformed disclosure records (v1 record shape)", () => {
    const nonObject = { ...validReceipt(), disclosures: [null] };
    expect(validateReceipt(nonObject).errors.some((e) => e.path === "disclosures[0]")).toBe(true);

    const empty = { ...validReceipt(), disclosures: [{}] };
    const emptyErrors = validateReceipt(empty).errors;
    for (const key of ["location", "channel", "content"]) {
      expect(emptyErrors.some((e) => e.path === `disclosures[0].${key}`)).toBe(true);
    }

    const nonStringField = {
      ...validReceipt(),
      disclosures: [{ location: 1, channel: "https://x/", content: "y" }],
    };
    expect(
      validateReceipt(nonStringField).errors.some((e) => e.path === "disclosures[0].location"),
    ).toBe(true);
  });
});

describe("validateReceiptAgainstWrit", () => {
  it("accepts a receipt whose mode and scope match the writ (R6)", () => {
    expect(validateReceiptAgainstWrit(validReceipt(), validWrit())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects a mode mismatch (R6)", () => {
    const writ: Writ = { ...validWrit(), mode: "dryrun" };
    expect(
      validateReceiptAgainstWrit(validReceipt(), writ).errors.some((e) => e.rule === "mode_match"),
    ).toBe(true);
  });

  it("rejects an action outside the writ's scope", () => {
    const writ = validWrit();
    writ.scope = ["core.browser.navigate"];
    expect(
      validateReceiptAgainstWrit(validReceipt(), writ).errors.some(
        (e) => e.rule === "scope_membership",
      ),
    ).toBe(true);
  });
});
