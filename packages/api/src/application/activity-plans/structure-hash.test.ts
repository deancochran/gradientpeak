import { activityPlanDocumentSchema, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import {
  activityPlanDocumentHash,
  activityPlanStructureHash,
  activityPlanV3StructureHash,
} from "./structure-hash";

const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              name: "Steady",
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
});

const baseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const buildId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const document = activityPlanDocumentSchema.parse({
  contractVersion: 1,
  defaultVariantId: baseId,
  variants: [
    { id: baseId, name: "Base", structure },
    { id: buildId, name: "Build", structure },
  ],
});

describe("activityPlanDocumentHash", () => {
  it("changes for document identity, metadata, ordering, or default selection", () => {
    const baseline = activityPlanDocumentHash(document);
    const changedName = activityPlanDocumentSchema.parse({
      ...document,
      variants: [document.variants[0], { ...document.variants[1], name: "Peak" }],
    });
    const changedDefault = activityPlanDocumentSchema.parse({
      ...document,
      defaultVariantId: buildId,
    });
    const changedOrder = activityPlanDocumentSchema.parse({
      ...document,
      variants: [...document.variants].reverse(),
    });

    expect(
      new Set([
        baseline,
        activityPlanDocumentHash(changedName),
        activityPlanDocumentHash(changedDefault),
        activityPlanDocumentHash(changedOrder),
      ]).size,
    ).toBe(4);
  });

  it("rejects a bare V3 structure", () => {
    expect(() => activityPlanDocumentHash(structure)).toThrow();
  });
});

describe("activityPlanV3StructureHash", () => {
  it("matches the established canonical hash for valid V3 structures", () => {
    expect(activityPlanV3StructureHash(structure)).toBe(activityPlanStructureHash(structure));
  });

  it("rejects non-V3 values at prescription trust boundaries", () => {
    expect(() => activityPlanV3StructureHash(document)).toThrow();
  });
});
