import { calculateCyclingNormalizedPower } from "@repo/core/calculations/normalized-power";
import { describe, expect, it } from "vitest";

import { getNormalizedPowerPresentation } from "./normalized-power-presentation";

function constantSamples(durationSeconds: number) {
  return Array.from({ length: durationSeconds + 1 }, (_, timestampSeconds) => ({
    timestampSeconds,
    powerWatts: 200,
  }));
}

describe("Normalized Power presentation propagation", () => {
  it("preserves available, partial, and unavailable contract evidence", () => {
    const available = calculateCyclingNormalizedPower({ samples: constantSamples(60) });
    const partial = calculateCyclingNormalizedPower({
      samples: [
        { timestampSeconds: 0, powerWatts: 200 },
        { timestampSeconds: 6, powerWatts: 900 },
        ...Array.from({ length: 30 }, (_, index) => ({
          timestampSeconds: index + 7,
          powerWatts: 200,
        })),
      ],
    });
    const unavailable = calculateCyclingNormalizedPower({
      samples: [
        { timestampSeconds: 0, powerWatts: 200 },
        { timestampSeconds: 6, powerWatts: 200 },
        ...Array.from({ length: 29 }, (_, index) => ({
          timestampSeconds: index + 7,
          powerWatts: 200,
        })),
      ],
    });

    expect(getNormalizedPowerPresentation(available)).toMatchObject({
      status: "available",
      valueWatts: 200,
      reason: null,
      calculationVersion: "cycling-normalized-power-v1",
      sourceTimeCoverage: 1,
      excludedGapDurationSeconds: 0,
    });
    expect(getNormalizedPowerPresentation(partial)).toMatchObject({
      status: "partial",
      valueWatts: 200,
      reason: "source_incomplete",
      calculationVersion: "cycling-normalized-power-v1",
      sourceTimeCoverage: 30 / 36,
      excludedGapDurationSeconds: 6,
      label: "Normalized power (partial)",
    });
    expect(getNormalizedPowerPresentation(partial)?.evidence).toContain("6 s excluded as gaps");
    expect(getNormalizedPowerPresentation(unavailable)).toMatchObject({
      status: "unavailable",
      valueWatts: null,
      reason: "insufficient_window",
      calculationVersion: "cycling-normalized-power-v1",
      sourceTimeCoverage: 29 / 35,
      excludedGapDurationSeconds: 6,
    });
    expect(getNormalizedPowerPresentation(unavailable)?.evidence).toContain(
      "less than one complete 30-second window",
    );
  });
});
