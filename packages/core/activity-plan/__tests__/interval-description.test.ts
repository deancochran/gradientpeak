import {
  getCanonicalActivityPlanStructureHashInput,
  resolveActivityPlanDraft,
  validateActivityPlanStructure,
} from "@repo/core";
import { describe, expect, it } from "vitest";

const structure = {
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step" as const,
      id: "00000000-0000-4000-8000-000000000001",
      instructions: "Sustained uphill efforts.",
      duration: { type: "time" as const, seconds: 60 },
      targets: [],
    },
  ],
};

describe("V5 step instructions", () => {
  it("retains instructions in the canonical structure and hash", () => {
    const serialized = getCanonicalActivityPlanStructureHashInput(structure);
    expect(JSON.parse(serialized).items[0].instructions).toBe("Sustained uphill efforts.");
    expect(
      getCanonicalActivityPlanStructureHashInput({
        ...structure,
        items: [{ ...structure.items[0], instructions: "Changed instructions." }],
      }),
    ).not.toBe(serialized);
  });
  it("round trips optional step instructions through draft resolution", () => {
    expect(resolveActivityPlanDraft(structure)).toMatchObject({
      status: "valid",
      structure: {
        items: [expect.objectContaining({ instructions: "Sustained uphill efforts." })],
      },
    });
  });
  it("rejects removed repeat metadata instead of adapting it", () => {
    expect(
      validateActivityPlanStructure({
        ...structure,
        items: [
          {
            type: "repeat",
            id: "00000000-0000-4000-8000-000000000002",
            count: 2,
            description: "obsolete",
            steps: [structure.items[0]],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
