import { describe, expect, it } from "vitest";
import { parseForm, resolveField } from "../src/index.js";

const HTML = `<html><body><form action="/go" method="POST">
<label for="fn">Full Name</label>
<input id="fn" name="full_name" type="text" value="default">
<textarea name="bio" aria-label="Biography">existing</textarea>
<select name="country"><option>FI</option></select>
<input type="submit" name="send" value="Send">
</form></body></html>`;

describe("parseForm", () => {
  it("extracts action, method, and data fields", () => {
    const form = parseForm(HTML)!;
    expect(form.action).toBe("/go");
    expect(form.method).toBe("POST");
    expect(form.fields.map((f) => f.name)).toEqual(["full_name", "bio", "country"]);
  });

  it("skips submit buttons", () => {
    const form = parseForm(HTML)!;
    expect(form.fields.some((f) => f.name === "send")).toBe(false);
  });

  it("captures default values and labels", () => {
    const form = parseForm(HTML)!;
    const fullName = form.fields.find((f) => f.name === "full_name")!;
    expect(fullName.value).toBe("default");
    expect(fullName.label).toBe("Full Name");
    const bio = form.fields.find((f) => f.name === "bio")!;
    expect(bio.value).toBe("existing");
    expect(bio.label).toBe("Biography");
  });

  it("returns null when there is no form", () => {
    expect(parseForm("<html><body><p>no form here</p></body></html>")).toBeNull();
  });
});

describe("resolveField", () => {
  it("resolves by exact name, case-insensitive name, and label", () => {
    const form = parseForm(HTML)!;
    expect(resolveField(form, "full_name")?.name).toBe("full_name");
    expect(resolveField(form, "FULL_NAME")?.name).toBe("full_name");
    expect(resolveField(form, "Full Name")?.name).toBe("full_name");
    expect(resolveField(form, "Biography")?.name).toBe("bio");
    expect(resolveField(form, "nonexistent")).toBeUndefined();
  });
});
