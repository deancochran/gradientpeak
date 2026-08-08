import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema, compileActivityPlan } from "../../activity-plan";
import {
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "../../performance-model";
import {
  activityPlanDurationEstimateSchema,
  describeActivityPlanDuration,
  estimateActivityPlanDuration,
  formatDuration,
  getExactDurationSeconds,
  summarizeActivityPlanDuration,
} from "../index";
import { formatDurationCompact, formatDuration as formatElapsedDuration } from "../time-format";

const ids = Array.from(
  { length: 8 },
  (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

const asOf = "2026-07-12T12:00:00.000Z";
const unavailableTargets = createUnavailableAthletePerformanceTargetFacts(asOf);
const runPerformanceTargets = athletePerformanceTargetFactsSchema.parse({
  ...unavailableTargets,
  running: {
    planningThresholdPace: {
      ...unavailableTargets.running.planningThresholdPace,
      status: "available",
      value: 300,
      calculationVersion: "duration-test-v1",
      sourceEvidenceIds: ["run-pace-1"],
      evidenceTime: {
        observedFrom: "2026-07-10T12:00:00.000Z",
        observedThrough: "2026-07-10T12:00:00.000Z",
        computedAt: asOf,
      },
      confidence: "high",
      expiresAt: "2026-10-10T12:00:00.000Z",
      reasons: [],
    },
  },
});

function singleStepPlan(input: {
  activityCategory: "bike" | "run" | "strength";
  duration:
    | { type: "distance"; meters: number }
    | { type: "repetitions"; count: number }
    | { type: "untilFinished" };
  intervalRepetitions?: number;
}) {
  return compileActivityPlan(
    activityPlanStructureSchema.parse({
      version: 3,
      activity_category: input.activityCategory,
      segments: [
        {
          role: "activity",
          id: "30000000-0000-4000-8000-000000000001",
          name: "Activity",
          intervals: [
            {
              id: "30000000-0000-4000-8000-000000000002",
              name: "Set",
              repetitions: input.intervalRepetitions ?? 1,
              steps: [
                {
                  id: "30000000-0000-4000-8000-000000000003",
                  name: "Step",
                  duration: input.duration,
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
}

describe("duration module", () => {
  it("never assigns exact elapsed time to distance, repetitions, or open completion", () => {
    expect(getExactDurationSeconds({ type: "distance", meters: 1000 })).toBeNull();
    expect(describeActivityPlanDuration({ type: "repetitions", count: 10 })).toMatchObject({
      exactElapsedSeconds: null,
      repetitionCount: 10,
    });
    expect(describeActivityPlanDuration({ type: "untilFinished" })).toMatchObject({
      exactElapsedSeconds: null,
      open: true,
    });
  });

  it("formats authored duration semantics", () => {
    expect(formatDuration({ type: "time", seconds: 90 })).toBe("1m 30s");
    expect(formatDuration({ type: "distance", meters: 1500 })).toBe("1.50km");
    expect(formatDuration({ type: "repetitions", count: 8 })).toBe("8 reps");
  });

  it("preserves seconds-based elapsed-duration formatting", () => {
    expect(formatElapsedDuration(59)).toBe("0:59");
    expect(formatElapsedDuration(3_661)).toBe("1:01:01");
    expect(formatDurationCompact(59)).toBe("59s");
    expect(formatDurationCompact(3_661)).toBe("1h 1m");
  });

  it("separates active, rest, distance, and open semantics", () => {
    const compiled = compileActivityPlan({
      version: 3,
      activity_category: "run",
      segments: [
        {
          role: "activity",
          id: ids[0],
          name: "Run",
          intervals: [
            {
              id: ids[1],
              name: "Set",
              repetitions: 1,
              steps: [
                {
                  id: ids[2],
                  name: "Timed",
                  duration: { type: "time", seconds: 300 },
                  targets: [{ type: "speed", intensity: 12 }],
                },
                {
                  id: ids[3],
                  name: "Distance",
                  duration: { type: "distance", meters: 1000 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
                {
                  id: ids[4],
                  name: "Open",
                  duration: { type: "untilFinished" },
                  targets: [{ type: "RPE", intensity: 4 }],
                },
              ],
            },
          ],
        },
        {
          role: "rest",
          id: ids[5],
          name: "Rest",
          duration: { type: "time", seconds: 30 },
        },
      ],
    });

    expect(summarizeActivityPlanDuration(compiled)).toMatchObject({
      exactElapsedSeconds: null,
      timedActiveSeconds: 300,
      restSeconds: 30,
      distanceMeters: 1000,
      openOccurrenceCount: 1,
    });
  });

  it("estimates distance only from a category-matched performance target", () => {
    const run = singleStepPlan({
      activityCategory: "run",
      duration: { type: "distance", meters: 5_000 },
    });
    const bike = singleStepPlan({
      activityCategory: "bike",
      duration: { type: "distance", meters: 5_000 },
    });

    expect(
      estimateActivityPlanDuration({
        compiledPlan: run,
        performanceTargets: runPerformanceTargets,
        asOf,
      }),
    ).toEqual({
      valueSeconds: 1_500,
      status: "estimated",
      basis: "distance_and_pace",
      confidence: "medium",
    });
    expect(
      estimateActivityPlanDuration({
        compiledPlan: bike,
        performanceTargets: runPerformanceTargets,
        asOf,
      }),
    ).toEqual({
      valueSeconds: null,
      status: "unavailable",
      basis: null,
      confidence: null,
    });
  });

  it("uses the bounded strength repetition policy", () => {
    const repetitions = singleStepPlan({
      activityCategory: "strength",
      duration: { type: "repetitions", count: 12 },
      intervalRepetitions: 3,
    });

    expect(estimateActivityPlanDuration({ compiledPlan: repetitions })).toEqual({
      valueSeconds: 360,
      status: "estimated",
      basis: "repetitions",
      confidence: "low",
    });
  });

  it("keeps open completion unavailable", () => {
    const open = singleStepPlan({
      activityCategory: "run",
      duration: { type: "untilFinished" },
    });

    expect(
      estimateActivityPlanDuration({
        compiledPlan: open,
        performanceTargets: runPerformanceTargets,
        asOf,
      }),
    ).toEqual({
      valueSeconds: null,
      status: "unavailable",
      basis: null,
      confidence: null,
    });
  });

  it("rejects provenance combinations that cannot exist", () => {
    expect(
      activityPlanDurationEstimateSchema.safeParse({
        valueSeconds: 1_500,
        status: "exact",
        basis: "distance_and_pace",
        confidence: "high",
      }).success,
    ).toBe(false);
  });
});
