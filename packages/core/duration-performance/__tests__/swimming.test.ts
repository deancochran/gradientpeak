import { describe, expect, it } from "vitest";

import {
  calculateSwimmingDurationPerformance,
  canonicalSwimCssProtocolEvidenceSchema,
  canonicalSwimRepeatedEffortProtocolEvidenceSchema,
  swimmingDurationPerformanceModelSchema,
} from "../swimming";
import {
  SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1 as fixture,
  swimmingEffortFixture,
} from "./fixtures/duration-performance-v1";
import { independentCssReference } from "./support/independent-reference";

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
    expectAvailable(model.css);
    expect(model.css.value.cssSecondsPer100Meters).toBe(fixture.expected.cssSecondsPer100Meters);
    expect(model.css.value.cssMetersPerSecond).toBeCloseTo(fixture.expected.cssMetersPerSecond, 12);
    expect(model.css.sourceEvidenceIds).toEqual([fixture.input.cssProtocols[0]?.evidenceId]);

    expectAvailable(model.capabilities.sprint);
    expectAvailable(model.capabilities.aerobic);
    expect(model.capabilities.aerobic.sourceEvidenceIds).toContain(
      fixture.input.cssProtocols[0]?.evidenceId,
    );
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

  it("agrees with an independent CSS reference", () => {
    const reference = independentCssReference(320, 150);
    const model = calculateSwimmingDurationPerformance(fixture.input);
    expectAvailable(model.css);
    expect(model.css.value.cssSecondsPer100Meters).toBe(reference.secondsPer100Meters);
    expect(model.css.value.cssMetersPerSecond).toBeCloseTo(reference.metersPerSecond, 12);
  });

  it.each([
    {
      name: "pool context",
      mutate: () => ({ poolLengthMeters: 50 }),
    },
    {
      name: "protocol identity",
      mutate: () => ({ protocolId: "another-protocol" }),
    },
    {
      name: "evidence revision",
      mutate: () => ({ evidenceRevision: 2 }),
    },
  ])("rejects a CSS effort with mismatched $name", ({ mutate }) => {
    const protocol = fixture.input.cssProtocols[0];
    if (!protocol) throw new Error("Swimming fixture requires CSS protocol evidence");
    expect(
      canonicalSwimCssProtocolEvidenceSchema.safeParse({
        ...protocol,
        efforts: [protocol.efforts[0], { ...protocol.efforts[1], ...mutate() }],
      }).success,
    ).toBe(false);
  });

  it("rejects incomplete timing, invalid effort order, and non-qualified status", () => {
    const protocol = fixture.input.cssProtocols[0];
    if (!protocol) throw new Error("Swimming fixture requires CSS protocol evidence");
    expect(
      canonicalSwimCssProtocolEvidenceSchema.safeParse({
        ...protocol,
        efforts: [protocol.efforts[0], { ...protocol.efforts[1], timingCoverage: "partial" }],
      }).success,
    ).toBe(false);
    expect(
      canonicalSwimCssProtocolEvidenceSchema.safeParse({
        ...protocol,
        efforts: [
          { ...protocol.efforts[0], endOffsetMs: protocol.efforts[1].endOffsetMs },
          protocol.efforts[1],
        ],
      }).success,
    ).toBe(false);
    expect(
      canonicalSwimCssProtocolEvidenceSchema.safeParse({
        ...protocol,
        status: "rejected",
        reasons: ["css_timing_incomplete"],
      }).success,
    ).toBe(false);
  });

  it("keeps open-water separate and withholds pool/CSS/sprint claims", () => {
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
      cssProtocols: [],
      repeatedEffortProtocols: [],
    });
    expect(model.environment).toBe("open_water");
    expectAvailable(model.paceDurationCurve);
    expect(model.css).toMatchObject({
      status: "unavailable",
      reasons: ["css_pool_protocol_required"],
    });
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
