import { describe, expect, it } from "vitest";
import { activityPlanAuthoringStructureSchema } from "./authoring";
import { type ActivityPlanDraftStep, resolveActivityPlanDraft } from "./draft";

const validStep: ActivityPlanDraftStep = {
  type: "step",
  id: "00000000-0000-4000-8000-000000000002",
  duration: { type: "time" as const, seconds: 60 },
  targets: [],
};
const validDraft = (step: ActivityPlanDraftStep = validStep, activity_category = "run") => ({
  version: 5 as const,
  activity_category,
  items: [step],
});
describe("activity plan authoring draft", () => {
  it("keeps an empty authoring draft invalid rather than manufacturing persisted V4 fields", () => {
    expect(
      resolveActivityPlanDraft({ version: 5, activity_category: null, items: [] }),
    ).toMatchObject({ status: "invalid" });
  });
  it("returns a validated V4 structure only after every required choice is supplied", () => {
    const result = resolveActivityPlanDraft(validDraft());
    expect(result).toMatchObject({ status: "valid", structure: { activity_category: "run" } });
  });
  it("represents selected target types without inventing an intensity, and rejects them at resolution", () => {
    expect(
      resolveActivityPlanDraft({
        version: 5,
        activity_category: "run",
        items: [
          {
            type: "step",
            id: "00000000-0000-4000-8000-000000000002",
            duration: null,
            targets: [{ type: "RPE", intensity: null }],
          },
        ],
      }),
    ).toMatchObject({ status: "invalid" });
  });
  it.each([
    ["untilFinished", validDraft({ ...validStep, duration: { type: "untilFinished" } })],
    [
      "strength distance",
      validDraft({ ...validStep, duration: { type: "distance", meters: 100 } }, "strength"),
    ],
    [
      "repetitions without exactly one RPE",
      validDraft(
        { ...validStep, duration: { type: "repetitions", count: 8 }, targets: [] },
        "strength",
      ),
    ],
    ["cadence-only", validDraft({ ...validStep, targets: [{ type: "cadence", intensity: 90 }] })],
    ["half RPE", validDraft({ ...validStep, targets: [{ type: "RPE", intensity: 5.25 }] })],
    [
      "over-100 %MaxHR",
      validDraft({ ...validStep, targets: [{ type: "%MaxHR", intensity: 101 }] }),
    ],
    [
      "zero distance speed",
      validDraft({
        ...validStep,
        duration: { type: "distance", meters: 100 },
        targets: [{ type: "speed", intensity: 0 }],
      }),
    ],
  ])("rejects authoring policy violations: %s", (_name, draft) => {
    expect(activityPlanAuthoringStructureSchema.safeParse(draft).success).toBe(false);
    expect(resolveActivityPlanDraft(draft)).toMatchObject({ status: "invalid" });
  });
  it("keeps explicit targetless steps valid while unfinished fields remain incomplete", () => {
    expect(resolveActivityPlanDraft(validDraft())).toMatchObject({ status: "valid" });
    expect(
      resolveActivityPlanDraft(
        validDraft({ ...validStep, duration: null, targets: [{ type: "RPE", intensity: null }] }),
      ),
    ).toMatchObject({ status: "invalid" });
  });
});
