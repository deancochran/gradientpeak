import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FLOW_PATHS = [
  ".maestro/flows/journeys/integrations/historical_fit_import.yaml",
  ".maestro/flows/journeys/profile/integrations_import_entry_open.yaml",
] as const;
const VISIBLE_IMPORT_SELECTORS = [
  "activity-import-screen",
  "activity-import-file-input",
  "activity-import-notes-input",
  "activity-import-submit-button",
] as const;

describe("historical import Maestro selector contract", () => {
  it.each(FLOW_PATHS)("uses selectors exported by the import screen in %s", async (flowPath) => {
    const root = path.resolve(import.meta.dirname, "..");
    const [flow, screen] = await Promise.all([
      readFile(path.join(root, flowPath), "utf8"),
      readFile(path.join(root, "app/(internal)/(standard)/activity-import.tsx"), "utf8"),
    ]);
    expect(flow).not.toContain("activity-import-pick-fit-file-button");
    for (const selector of VISIBLE_IMPORT_SELECTORS) {
      expect(flow).toContain(`id: "${selector}"`);
      expect(screen).toMatch(new RegExp(`testI[Dd]="${selector}"`));
    }
  });
});
