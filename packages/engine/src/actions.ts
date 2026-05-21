// Static properties of the v0 core action vocabulary.

/** Actions that commit to an external system and cannot be reversed. */
const IRREVERSIBLE: Record<string, boolean> = {
  "core.file.read": false,
  "core.browser.navigate": false,
  "core.form.fill": false,
  "core.form.submit": true,
  "core.browser.screenshot": false,
};

/** Whether an action is irreversible. Unknown actions default to reversible. */
export function isIrreversible(action: string): boolean {
  return IRREVERSIBLE[action] ?? false;
}

/** Whether successful execution of an action consumes a token (a consumption limit applies). */
export function consumesToken(action: string): boolean {
  return action === "core.form.submit";
}
