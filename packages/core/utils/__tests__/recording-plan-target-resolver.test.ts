import { describe, expect, it } from "vitest";

import { resolvePlanStepTrainerIntents } from "../recording-plan-target-resolver";

describe("recording plan target resolver", () => {
  it("converts FTP targets into canonical power intents", () => {
    const resolution = resolvePlanStepTrainerIntents({
      step: {
        targets: [{ type: "%FTP", intensity: 90 }],
      },
      profileSnapshot: {
        ftp: 300,
      },
    });

    expect(resolution.intents).toEqual([
      {
        type: "set_power",
        source: "step_change",
        watts: 270,
      },
    ]);
    expect(resolution.unresolvedTargets).toEqual([]);
  });

  it("keeps heart-rate and RPE targets informational instead of mapping them to trainer commands", () => {
    const resolution = resolvePlanStepTrainerIntents({
      step: {
        targets: [
          { type: "%ThresholdHR", intensity: 95 },
          { type: "RPE", intensity: 7 },
        ],
      },
    });

    expect(resolution.intents).toEqual([]);
    expect(resolution.informationalTargets).toHaveLength(2);
  });

  it("maps cadence and speed targets into canonical trainer intents", () => {
    const resolution = resolvePlanStepTrainerIntents({
      step: {
        targets: [
          { type: "cadence", intensity: 92 },
          { type: "speed", intensity: 8.5 },
        ],
      },
      source: "periodic_refinement",
    });

    expect(resolution.intents).toEqual([
      {
        type: "set_cadence",
        source: "periodic_refinement",
        rpm: 92,
      },
      {
        type: "set_speed",
        source: "periodic_refinement",
        metersPerSecond: 8.5,
      },
    ]);
  });

  it("marks percentage-based power targets unresolved when FTP is unavailable", () => {
    const resolution = resolvePlanStepTrainerIntents({
      step: {
        targets: [{ type: "%FTP", intensity: 105 }],
      },
    });

    expect(resolution.intents).toEqual([]);
    expect(resolution.unresolvedTargets).toEqual([{ type: "%FTP", intensity: 105 }]);
  });
});
