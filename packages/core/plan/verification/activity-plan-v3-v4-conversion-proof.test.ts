import { describe, expect, it } from "vitest";

import { FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT, SYSTEM_TEMPLATES } from "../../samples";
import {
  assertFixedSystemTemplateMaterializationParity,
  inventoryFixedSystemTemplateConversion,
  verifyFixedSystemTemplateMaterialization,
} from "./activity-plan-v3-v4-conversion-proof";

describe("fixed V5 system-template materialization evidence", () => {
  it("materializes and validates every catalog member from the fixed V5 source", () => {
    const inventory = verifyFixedSystemTemplateMaterialization();

    expect(SYSTEM_TEMPLATES).toHaveLength(68);
    expect(FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT).toBe(68);
    expect(inventory).toHaveLength(68);
    expect(inventory.every((entry) => entry.outcome === "converted")).toBe(true);
    expect(inventory.every((entry) => entry.item_count > 0)).toBe(true);
    expect(inventory.every((entry) => entry.expanded_step_occurrences > 0)).toBe(true);
  });

  it("matches every active builder output to frozen V5 quantities and text", () => {
    expect(() => assertFixedSystemTemplateMaterializationParity()).not.toThrow();
  });

  it("keeps stable template identities and has no active adaptation field", () => {
    const inventory = inventoryFixedSystemTemplateConversion();

    expect(new Set(inventory.map((entry) => entry.template_id)).size).toBe(SYSTEM_TEMPLATES.length);
    expect(SYSTEM_TEMPLATES.every((template) => !("adaptation" in template))).toBe(true);
  });
});
