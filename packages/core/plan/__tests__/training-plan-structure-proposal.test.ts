import { describe, expect, it } from "vitest";
import { deriveTrainingPlanStructureProposal } from "../trainingPlanStructureProposal";

describe("deriveTrainingPlanStructureProposal", () => {
  it("explains goal-driven consistency structure decisions", () => {
    const proposal = deriveTrainingPlanStructureProposal({
      goals: [
        {
          objective: {
            type: "consistency",
            target_sessions_per_week: 4,
            target_weeks: 3,
          },
        },
      ],
      preferences: { durationWeeks: null, weeklySessionCount: null },
    });

    expect(proposal.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attribute: "goals",
          source: "goal",
          value: "1 consistency",
        }),
        expect.objectContaining({
          attribute: "duration-weeks",
          source: "goal",
          value: "3",
        }),
        expect.objectContaining({
          attribute: "weekly-session-count",
          source: "goal",
          value: "4",
          driver: "consistency-frequency",
        }),
        expect.objectContaining({
          attribute: "starter-values",
          source: "derived",
          value: "45 TSS / 45m",
          driver: "consistency-frequency",
        }),
      ]),
    );
  });

  it("explains starter defaults and endurance anchor drivers", () => {
    const proposal = deriveTrainingPlanStructureProposal({
      goals: [
        {
          objective: {
            type: "completion",
            activity_category: "run",
            distance_m: 21_100,
          },
        },
      ],
      preferences: { durationWeeks: null, weeklySessionCount: null },
    });

    expect(proposal.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attribute: "duration-weeks",
          source: "default",
          value: "4",
        }),
        expect.objectContaining({
          attribute: "weekly-session-count",
          source: "default",
          value: "3",
          driver: "starter-frequency",
        }),
        expect.objectContaining({
          attribute: "starter-values",
          source: "default",
          value: "60 TSS / 60m",
        }),
        expect.objectContaining({
          attribute: "endurance-anchor",
          source: "goal",
          value: "Included",
          driver: "completion-distance",
        }),
      ]),
    );
  });
});
