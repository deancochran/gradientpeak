import { describe, expect, it } from "vitest";

import {
  calculateSwimmingDurationPerformance,
  canonicalSwimRepeatedEffortProtocolEvidenceSchema,
  swimmingDurationPerformanceModelSchema,
} from "../swimming";
import {
  SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1 as fixture,
  swimmingEffortFixture,
} from "./fixtures/duration-performance-v1";

function expectAvailable<T extends { status: string; value: unknown }>(
  outcome: T,
): asserts outcome is T & { status: "available"; value: Exclude<T["value"], null> } {
  expect(outcome.status).toBe("available");
}

describe("swimming duration performance", () => {
  it("keeps pool timing evidence together and activates only supported concepts", () => {
    const model = calculateSwimmingDurationPerformance(fixture.input);
    expect(swimmingDurationPerformanceModelSchema.parse(model)).toEqual(model);
    expect(model.environment).toBe("pool");
    expectAvailable(model.paceDurationCurve);
    expectAvailable(model.capabilities.sprint);
    expectAvailable(model.capabilities.aerobic);
    expect(model.capabilities.aerobic.value.basis).toBe("pool_duration_curve");
    expectAvailable(model.capabilities.repeatedEffortDecay);
    expect(model.capabilities.repeatedEffortDecay.value.finalSpeedRetentionRatio).toBeCloseTo(
      fixture.expected.repeatedFinalRetentionRatio,
      12,
    );
    expect(model.capabilities.repeatedEffortDecay.value.maximumSpeedLossRatio).toBeCloseTo(
      fixture.expected.repeatedMaximumLossRatio,
      12,
    );
    expect(model.trainingLevels.every((level) => level.status === "available")).toBe(true);
  });

  it("keeps open-water separate and withholds pool sprint claims", () => {
    const openEfforts = [600, 1_200, 1_800, 3_600].map((durationSeconds, index) =>
      swimmingEffortFixture({
        evidenceId: `open-${durationSeconds}`,
        activityId: `open-activity-${index % 2}`,
        durationSeconds,
        speedMetersPerSecond: 1.35 - index * 0.05,
        environment: "open_water",
      }),
    );
    const model = calculateSwimmingDurationPerformance({
      ...fixture.input,
      efforts: openEfforts,
      repeatedEffortProtocols: [],
    });
    expect(model.environment).toBe("open_water");
    expectAvailable(model.paceDurationCurve);
    expect(model.capabilities.sprint).toMatchObject({
      status: "unavailable",
      reasons: ["sprint_not_supported_for_open_water_timing"],
    });
    expectAvailable(model.capabilities.aerobic);
    expect(model.capabilities.aerobic.value.basis).toBe("open_water_duration_curve");
    expect(model.capabilities.repeatedEffortDecay).toMatchObject({
      status: "unavailable",
      reasons: ["repeated_effort_decay_not_supported_for_open_water"],
    });
  });

  it("abstains on mixed environments and without explicit repeat protocol evidence", () => {
    const mixedEffort = swimmingEffortFixture({
      evidenceId: "mixed-open",
      activityId: "mixed-open-activity",
      durationSeconds: 3_600,
      speedMetersPerSecond: 1.2,
      environment: "open_water",
    });
    const mixed = calculateSwimmingDurationPerformance({
      ...fixture.input,
      efforts: [...fixture.input.efforts, mixedEffort],
    });
    expect(mixed.environment).toBe("mixed");
    expect(mixed.paceDurationCurve).toMatchObject({
      status: "unavailable",
      reasons: ["mixed_pool_open_water_evidence"],
    });

    const noRepeat = calculateSwimmingDurationPerformance({
      ...fixture.input,
      repeatedEffortProtocols: [],
    });
    expect(noRepeat.capabilities.repeatedEffortDecay).toMatchObject({
      status: "unavailable",
      reasons: ["repeated_effort_protocol_evidence_missing"],
      value: null,
    });
  });

  it("rejects incomplete repeat protocol identity instead of inferring recovery", () => {
    const protocol = fixture.input.repeatedEffortProtocols[0];
    if (!protocol) throw new Error("Swimming fixture requires repeat protocol evidence");
    expect(
      canonicalSwimRepeatedEffortProtocolEvidenceSchema.safeParse({
        ...protocol,
        recoveries: protocol.recoveries.slice(0, 1),
      }).success,
    ).toBe(false);
  });

  it("propagates partial pool timing and withholds the dependent sprint level", () => {
    const efforts = fixture.input.efforts.map((effort) =>
      effort.durationSeconds === 30
        ? swimmingEffortFixture({
            evidenceId: effort.evidenceId,
            activityId: effort.activityId,
            durationSeconds: effort.durationSeconds,
            speedMetersPerSecond: effort.value,
            extractionStatus: "partial",
            sourceTimeCoverage: 0.9,
          })
        : effort,
    );
    const model = calculateSwimmingDurationPerformance({ ...fixture.input, efforts });
    expect(model.paceDurationCurve).toMatchObject({
      status: "partial",
      reasons: ["partial_source_evidence"],
    });
    expect(model.capabilities.sprint.status).toBe("partial");
    expect(model.trainingLevels.find((level) => level.levelId === "sprint_pace")).toMatchObject({
      status: "unavailable",
      reasons: ["training_level_capability_unavailable"],
    });
  });
});
