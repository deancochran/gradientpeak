import { describe, expect, it } from "vitest";
import {
  type ActivityPlanNamingStep,
  deriveAutomaticActivityPlanIntervalLabel,
  deriveAutomaticActivityPlanStepLabel,
  deriveEffectiveActivityPlanIntervalLabel,
  deriveEffectiveActivityPlanStepLabel,
} from "../derived-naming";

const targets = (target: ActivityPlanNamingStep["targets"][number]) => [target];

const step = (input: ActivityPlanNamingStep) => input;

describe("derived activity-plan naming", () => {
  it.each([
    [1, "Easy effort"],
    [3, "Easy effort"],
    [3.01, "Moderate effort"],
    [6, "Moderate effort"],
    [6.01, "Hard effort"],
    [8, "Hard effort"],
    [8.01, "Very hard effort"],
    [10, "Very hard effort"],
  ])("uses documented inclusive RPE bands for %s", (intensity, expected) => {
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "run",
        targets: [{ type: "RPE", intensity }],
      }),
    ).toBe(expected);
  });

  it("uses neutral authored target-family labels and running pace wording", () => {
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "run",
        targets: targets({ type: "speed", intensity: 12 }),
      }),
    ).toBe("Pace effort");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "bike",
        targets: targets({ type: "speed", intensity: 30 }),
      }),
    ).toBe("Speed effort");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "bike",
        targets: targets({ type: "watts", intensity: 250 }),
      }),
    ).toBe("Power effort");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "run",
        targets: targets({ type: "bpm", intensity: 160 }),
      }),
    ).toBe("Heart-rate effort");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "bike",
        targets: targets({ type: "%FTP", intensity: 80 }),
      }),
    ).toBe("Power effort");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "run",
        targets: [{ type: "%ThresholdHR", intensity: 90 }],
      }),
    ).toBe("Heart-rate effort");
    expect(
      deriveAutomaticActivityPlanStepLabel({
        activityCategory: "bike",
        targets: targets({ type: "cadence", intensity: 95 }),
      }),
    ).toBe("Cadence effort");
    expect(deriveAutomaticActivityPlanStepLabel({ activityCategory: "bike", targets: [] })).toBe(
      "Untargeted",
    );
  });

  it("selects the same primary target for reversed authored target ordering without mutation", () => {
    const first = Object.freeze([
      Object.freeze({ type: "watts" as const, intensity: 250 }),
      Object.freeze({ type: "RPE" as const, intensity: 7 }),
    ]);
    const reversed = Object.freeze([...first].reverse());

    expect(deriveAutomaticActivityPlanStepLabel({ activityCategory: "bike", targets: first })).toBe(
      "Hard effort",
    );
    expect(
      deriveAutomaticActivityPlanStepLabel({ activityCategory: "bike", targets: reversed }),
    ).toBe("Hard effort");
    expect(first).toEqual([
      { type: "watts", intensity: 250 },
      { type: "RPE", intensity: 7 },
    ]);
  });

  it("preserves explicit step names verbatim and restores automatic naming when cleared", () => {
    const unnamed = step({ targets: targets({ type: "RPE", intensity: 2 }) });
    expect(
      deriveEffectiveActivityPlanStepLabel({
        activityCategory: "run",
        step: { ...unnamed, name: "  Hills  " },
      }),
    ).toBe("  Hills  ");
    expect(deriveEffectiveActivityPlanStepLabel({ activityCategory: "run", step: unnamed })).toBe(
      "Easy effort",
    );
  });

  it("uses a single effective label, concise sequences, and repeated sequence prefixes", () => {
    expect(
      deriveAutomaticActivityPlanIntervalLabel({
        activityCategory: "run",
        repetitions: 1,
        steps: [step({ targets: targets({ type: "RPE", intensity: 7 }) })],
      }),
    ).toBe("Hard effort");
    expect(
      deriveAutomaticActivityPlanIntervalLabel({
        activityCategory: "run",
        repetitions: 5,
        steps: [step({ targets: targets({ type: "RPE", intensity: 7 }) })],
      }),
    ).toBe("5 × Hard");
    expect(
      deriveAutomaticActivityPlanIntervalLabel({
        activityCategory: "run",
        repetitions: 1,
        steps: [
          step({ targets: targets({ type: "RPE", intensity: 2 }) }),
          step({ targets: targets({ type: "RPE", intensity: 7 }) }),
        ],
      }),
    ).toBe("Easy / Hard");
  });

  it("uses a homogeneous family sequence and deterministic mixed fallback", () => {
    expect(
      deriveAutomaticActivityPlanIntervalLabel({
        activityCategory: "run",
        repetitions: 1,
        steps: [
          step({ targets: targets({ type: "speed", intensity: 10 }) }),
          step({ targets: targets({ type: "speed", intensity: 12 }) }),
        ],
      }),
    ).toBe("Pace sequence");
    expect(
      deriveAutomaticActivityPlanIntervalLabel({
        activityCategory: "bike",
        repetitions: 5,
        steps: [
          step({ name: "A".repeat(49), targets: [] }),
          step({ name: "Recovery", targets: [] }),
        ],
      }),
    ).toBe("5 × Mixed sequence");
    expect(
      deriveAutomaticActivityPlanIntervalLabel({
        activityCategory: "bike",
        repetitions: 1,
        steps: [
          step({ name: "😀".repeat(42), targets: [] }),
          step({ name: "Recovery", targets: [] }),
        ],
      }),
    ).toBe("Mixed sequence");
  });

  it("preserves custom names in interval labels and supports an optional interval override without payload mutation", () => {
    const steps = Object.freeze([
      Object.freeze(step({ name: "Race prep", targets: targets({ type: "RPE", intensity: 2 }) })),
      Object.freeze(step({ name: "Fast finish", targets: targets({ type: "RPE", intensity: 8 }) })),
    ]);
    const input = Object.freeze({ activityCategory: "run" as const, repetitions: 2, steps });

    expect(deriveAutomaticActivityPlanIntervalLabel(input)).toBe("2 × Race prep / Fast finish");
    expect(deriveEffectiveActivityPlanIntervalLabel({ ...input, customName: "Hill repeats" })).toBe(
      "Hill repeats",
    );
    expect(input).toEqual({ activityCategory: "run", repetitions: 2, steps });
  });
});
