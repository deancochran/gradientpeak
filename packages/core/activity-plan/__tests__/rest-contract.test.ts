import { describe, expect, it } from "vitest";

import { calculateActivityPlanStats } from "../../activity-plan-calculations";
import { estimateActivityPlanDuration, formatDuration } from "../../duration";
import { getActivityPlanProviderProjection } from "../../plan/activityPlanProviderReadiness";
import type { ActivityTarget } from "../../targets";
import {
  activityPlanAuthoringStructureSchema,
  activityPlanStructureSchema,
  buildActivityPlanPrintModel,
  compileActivityPlan,
  deriveActivityPlanPresentation,
  deriveAutomaticActivityPlanStepLabel,
  getActivityPlanAuthoringIssues,
} from "..";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const activeStep = (
  value: number,
  targets: ActivityTarget[] = [{ type: "RPE", intensity: 2 }],
) => ({
  type: "step" as const,
  id: id(value),
  duration: { type: "time" as const, seconds: 60 },
  targets,
});

const restStep = (value: number) => ({
  type: "step" as const,
  id: id(value),
  duration: { type: "time" as const, seconds: 30 },
  targets: [{ type: "rest" as const }],
});

const plan = (items: unknown[] = [activeStep(1), restStep(2)]) => ({
  version: 5 as const,
  activity_category: "run" as const,
  items,
});

describe("activity-plan rest target", () => {
  it.each([
    { type: "repetitions", count: 10 },
    { type: "untilFinished" },
    { type: "time", seconds: 0 },
    { type: "time", seconds: -1 },
    { type: "time", seconds: 0.5 },
    { type: "time", seconds: 86401 },
  ])("rejects invalid rest completion %j", (duration) => {
    expect(
      activityPlanStructureSchema.safeParse(plan([{ ...restStep(1), duration }])).success,
    ).toBe(false);
  });
  it("accepts only a strict, timed, sole rest target", () => {
    expect(activityPlanStructureSchema.safeParse(plan()).success).toBe(true);
    expect(activityPlanAuthoringStructureSchema.safeParse(plan()).success).toBe(true);
    expect(getActivityPlanAuthoringIssues(activityPlanStructureSchema.parse(plan()))).toEqual([]);
    expect(
      activityPlanStructureSchema.safeParse(
        plan([{ ...restStep(1), targets: [{ type: "rest" }, { type: "RPE", intensity: 2 }] }]),
      ).success,
    ).toBe(false);
    expect(
      activityPlanStructureSchema.safeParse(
        plan([{ ...restStep(1), duration: { type: "distance", meters: 100 } }]),
      ).success,
    ).toBe(false);
    expect(
      activityPlanStructureSchema.safeParse(
        plan([{ ...restStep(1), targets: [{ type: "rest", intensity: 0 }] }]),
      ).success,
    ).toBe(false);
  });

  it("keeps empty and low-RPE targets active while preserving legacy multi-target steps", () => {
    const structure = activityPlanStructureSchema.parse(
      plan([
        activeStep(1, []),
        activeStep(2, [{ type: "RPE", intensity: 1 }]),
        activeStep(3, [
          { type: "RPE", intensity: 2 },
          { type: "cadence", intensity: 80 },
        ]),
      ]),
    );
    expect(activityPlanAuthoringStructureSchema.safeParse(structure).success).toBe(true);
    expect(getActivityPlanAuthoringIssues(structure)).toEqual([]);
  });

  it("accounts for rest separately from active time and presents it without an intensity", () => {
    const compiled = compileActivityPlan(plan());
    expect(calculateActivityPlanStats(compiled).duration).toMatchObject({
      exactElapsedSeconds: 90,
      timedActiveSeconds: 60,
      restSeconds: 30,
    });
    expect(estimateActivityPlanDuration({ compiledPlan: compiled })).toMatchObject({
      status: "exact",
      basis: "compiled_time",
      valueSeconds: 90,
    });
    expect(formatDuration({ type: "time", seconds: 30 })).toBe("30s");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "run",
        targets: [{ type: "rest" }],
      }),
    ).toBe("Rest");
    expect(deriveActivityPlanPresentation(plan())?.occurrences[1]).toMatchObject({
      intensityBasis: "unavailable",
      intensityLabel: "Rest",
    });
    expect(
      buildActivityPlanPrintModel({ format: "full-page", structure: plan(), title: "Intervals" })
        ?.totals,
    ).toEqual(["Active time: 1m", "Rest: 30s"]);
  });

  it("retains rest natively but rejects external projection without a real mapping", () => {
    expect(
      getActivityPlanProviderProjection({
        provider: "native",
        structure: activityPlanStructureSchema.parse(plan()),
      }).disposition,
    ).toBe("compatible");
    const projection = getActivityPlanProviderProjection({
      provider: "wahoo",
      structure: activityPlanStructureSchema.parse(plan()),
    });
    expect(projection.disposition).toBe("unsupported");
    expect(projection.findings).toContainEqual(
      expect.objectContaining({
        semantic: "target",
        targetType: "rest",
        reasonCode: "unsupported_target",
      }),
    );
  });
});
