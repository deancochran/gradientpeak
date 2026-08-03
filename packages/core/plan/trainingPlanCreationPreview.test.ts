import { describe, expect, it } from "vitest";

import { deriveTrainingPlanCreationPreview } from "./trainingPlanCreationPreview";

describe("deriveTrainingPlanCreationPreview", () => {
  it("marks an all-unknown week and plan unavailable instead of summing unknowns as zero", () => {
    const preview = deriveTrainingPlanCreationPreview({
      sessions: [
        {
          offsetDays: 0,
          assigned: true,
          estimatedCommonLoad: null,
          estimatedDurationSeconds: null,
        },
      ],
    });

    expect(preview.weeks).toEqual([]);
    expect(preview.unavailableWeeks[0]).toMatchObject({
      estimatedCommonLoad: null,
      commonLoadStatus: "unavailable",
      estimatedDurationSeconds: null,
      durationStatus: "unavailable",
    });
    expect(preview).toMatchObject({
      totalEstimatedLoad: null,
      totalLoadStatus: "unavailable",
      totalEstimatedDurationSeconds: null,
      totalDurationStatus: "unavailable",
    });
  });

  it("retains known subtotals while marking mixed aggregation partial", () => {
    const preview = deriveTrainingPlanCreationPreview({
      sessions: [
        {
          offsetDays: 0,
          assigned: true,
          estimatedCommonLoad: 40,
          estimatedDurationSeconds: 1800,
        },
        {
          offsetDays: 2,
          assigned: true,
          estimatedCommonLoad: null,
          estimatedDurationSeconds: null,
        },
        {
          offsetDays: 7,
          assigned: true,
          estimatedCommonLoad: 60,
          estimatedDurationSeconds: 3600,
        },
      ],
    });

    expect(preview.weeks).toMatchObject([
      {
        estimatedCommonLoad: 40,
        commonLoadStatus: "partial",
        estimatedDurationSeconds: 1800,
        durationStatus: "partial",
      },
      {
        estimatedCommonLoad: 60,
        commonLoadStatus: "complete",
        estimatedDurationSeconds: 3600,
        durationStatus: "complete",
      },
    ]);
    expect(preview).toMatchObject({
      totalEstimatedLoad: 100,
      totalLoadStatus: "partial",
      totalEstimatedDurationSeconds: 5400,
      totalDurationStatus: "partial",
    });
  });

  it("preserves explicitly known zero as complete", () => {
    const preview = deriveTrainingPlanCreationPreview({
      sessions: [
        {
          offsetDays: 0,
          assigned: true,
          estimatedCommonLoad: 0,
          estimatedDurationSeconds: 0,
        },
      ],
    });

    expect(preview.weeks[0]).toMatchObject({
      estimatedCommonLoad: 0,
      commonLoadStatus: "complete",
      estimatedDurationSeconds: 0,
      durationStatus: "complete",
    });
    expect(preview).toMatchObject({
      totalEstimatedLoad: 0,
      totalLoadStatus: "complete",
      totalEstimatedDurationSeconds: 0,
      totalDurationStatus: "complete",
    });
  });

  it("does not classify missing evidence as a light endurance session or compute a partial ramp", () => {
    const preview = deriveTrainingPlanCreationPreview({
      sessions: [
        {
          offsetDays: 0,
          assigned: true,
          intent: { type: "endurance" },
          estimatedCommonLoad: null,
          estimatedDurationSeconds: 1800,
        },
        {
          offsetDays: 7,
          assigned: true,
          estimatedCommonLoad: 200,
          estimatedDurationSeconds: 3600,
        },
      ],
    });

    expect(preview.checks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "intent_mismatch" })]),
    );
    expect(preview.checks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "large_weekly_load_ramp" })]),
    );
  });
});
