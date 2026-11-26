import { describe, expect, it } from "vitest";
import {
  activityPlanAuthoringStructureSchema,
  activityPlanStepNoteSchema,
  activityPlanStructureSchema,
} from "..";

const plan = (instructions: string, repeated = false) => {
  const step = {
    type: "step",
    id: "00000000-0000-4000-8000-000000000001",
    duration: { type: "time", seconds: 60 },
    targets: [{ type: "RPE", intensity: 5 }],
    instructions,
  };
  return {
    version: 5,
    activity_category: "run",
    items: repeated
      ? [{ type: "repeat", id: "00000000-0000-4000-8000-000000000002", count: 2, steps: [step] }]
      : [step],
  };
};

describe("short, single-line step note authoring", () => {
  it.each([
    "\n",
    "\r",
    "\r\n",
    "\n\n",
    "\u000b",
    "\u000c",
    "\u0085",
    "\u2028",
    "\u2029",
  ])("rejects deliberate separators %j without rewriting historical notes", (separator) => {
    for (const instructions of [
      `Easy${separator}Finish relaxed.`,
      `${separator}Easy`,
      `Easy${separator}`,
    ]) {
      expect(activityPlanStepNoteSchema.safeParse(instructions).success).toBe(false);
      for (const repeated of [false, true]) {
        const input = plan(instructions, repeated);
        expect(activityPlanStructureSchema.parse(input)).toEqual(input);
        const result = activityPlanAuthoringStructureSchema.safeParse(input);
        expect(result.success).toBe(false);
        expect(result.error?.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: repeated
                ? ["items", 0, "steps", 0, "instructions"]
                : ["items", 0, "instructions"],
            }),
          ]),
        );
      }
    }
  });
  it("permits short notes and clearing, but not paragraphs beyond the character limit", () => {
    expect(activityPlanStepNoteSchema.safeParse(undefined).success).toBe(true);
    expect(activityPlanStepNoteSchema.safeParse("").success).toBe(true);
    expect(
      activityPlanAuthoringStructureSchema.safeParse(plan("Keep a relaxed stride.")).success,
    ).toBe(true);
    expect(activityPlanStepNoteSchema.safeParse("a".repeat(160)).success).toBe(true);
    expect(activityPlanStepNoteSchema.safeParse("a".repeat(161)).success).toBe(false);
    expect(activityPlanAuthoringStructureSchema.safeParse(plan("a".repeat(161))).success).toBe(
      false,
    );
    expect(activityPlanStepNoteSchema.safeParse("🏃".repeat(160)).success).toBe(true);
    expect(activityPlanStepNoteSchema.safeParse("🏃".repeat(161)).success).toBe(false);
  });
});
