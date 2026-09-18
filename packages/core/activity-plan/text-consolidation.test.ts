import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "./structure-schema";
import {
  ACTIVITY_PLAN_TEXT_LIMITS,
  consolidateActivityPlanAuthoringText,
  consolidateActivityPlanText,
} from "./text-consolidation";

const structure = (step: Record<string, unknown>) =>
  activityPlanStructureSchema.parse({
    version: 3,
    activity_category: "run",
    segments: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Run",
        role: "activity",
        intervals: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "00000000-0000-4000-8000-000000000003",
                name: "Steady",
                duration: { type: "time", seconds: 60 },
                targets: [{ type: "RPE", intensity: 5 }],
                ...step,
              },
            ],
          },
        ],
      },
    ],
  });

describe("activity-plan text consolidation", () => {
  it("keeps secondary-only text visible without reformatting it", () => {
    expect(consolidateActivityPlanText(null, "  Keep this exact text  ", "Notes")).toBe(
      "  Keep this exact text  ",
    );
  });

  it("accepts a legacy notes-only plan at its former maximum", () => {
    const notes = "n".repeat(2_000);
    expect(
      consolidateActivityPlanAuthoringText({ description: null, notes, structure: structure({}) }),
    ).toMatchObject({ status: "valid", value: { description: notes, notes: null } });
  });

  it("deduplicates values that differ only in surrounding whitespace", () => {
    expect(consolidateActivityPlanText("Same", " Same ", "Notes")).toBe("Same");
  });

  it("labels and retains distinct legacy text once", () => {
    const first = consolidateActivityPlanText("Primary", "Secondary", "Notes");
    expect(first).toBe("Primary\n\nNotes:\nSecondary");
    expect(consolidateActivityPlanText(first, null, "Notes")).toBe(first);
  });

  it("moves step description into the canonical instructions field", () => {
    const result = consolidateActivityPlanAuthoringText({
      description: "Plan",
      notes: "Plan notes",
      structure: structure({ description: "Step description", notes: "Instructions" }),
    });
    expect(result).toEqual({
      status: "valid",
      value: {
        description: "Plan\n\nNotes:\nPlan notes",
        notes: null,
        structure: structure({ notes: "Instructions\n\nDescription:\nStep description" }),
      },
    });
  });

  it("rejects oversized merged content without truncating it", () => {
    const result = consolidateActivityPlanAuthoringText({
      description: "a".repeat(ACTIVITY_PLAN_TEXT_LIMITS.planDescription),
      notes: "b",
      structure: structure({}),
    });
    expect(result).toEqual({
      status: "too_long",
      issues: [{ limit: ACTIVITY_PLAN_TEXT_LIMITS.planDescription, path: "description" }],
    });
  });

  it("accepts the largest valid legacy plan pair", () => {
    const result = consolidateActivityPlanAuthoringText({
      description: "a".repeat(1_000),
      notes: "b".repeat(2_000),
      structure: structure({}),
    });
    expect(result).toMatchObject({
      status: "valid",
      value: {
        description: `${"a".repeat(1_000)}\n\nNotes:\n${"b".repeat(2_000)}`,
        notes: null,
      },
    });
  });

  it("does not resurrect cleared secondary text on a later save", () => {
    const saved = consolidateActivityPlanAuthoringText({
      description: "Plan",
      notes: "Legacy notes",
      structure: structure({}),
    });
    expect(saved.status).toBe("valid");
    if (saved.status !== "valid") return;
    expect(
      consolidateActivityPlanAuthoringText({
        description: saved.value.description,
        notes: null,
        structure: saved.value.structure,
      }),
    ).toEqual(saved);
  });
});
