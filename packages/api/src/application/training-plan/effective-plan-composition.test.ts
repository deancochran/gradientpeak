import { calculateAvailableCommonLoad } from "@repo/core/load";
import { describe, expect, it } from "vitest";
import { composeEffectivePlanDto } from "./effective-plan-composition";

const commonLoad = calculateAvailableCommonLoad({
  sport: "bike",
  method: "power_threshold",
  intensity: 1,
  contributingDurationSeconds: 3600,
  quality: {
    source: "manual",
    observed_at: "2026-07-01T00:00:00.000Z",
    valid_at: "2026-07-01T00:00:00.000Z",
    confidence: "high",
    stale: false,
    estimate: false,
    calculation_version: null,
    evidence_fingerprint: "ftp",
  },
  thresholdEvidence: {
    type: "ftp_watts",
    value: 250,
    unit: "watts",
    source: "manual",
    observedAt: "2026-07-01T00:00:00.000Z",
    validAt: "2026-07-01T00:00:00.000Z",
    freshness: "current",
    calculationVersion: null,
    sourceFingerprint: "ftp",
  },
  evidenceFingerprint: "activity-or-plan",
  computedAsOf: "2026-07-23T12:00:00.000Z",
  estimated: true,
});

describe("composeEffectivePlanDto", () => {
  it("keeps tentative availability separate from the firm effective value", () => {
    const result = composeEffectivePlanDto({
      scheduledItems: [
        {
          scheduledItemId: "firm",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: false,
          linkedCompletedActivityId: null,
          commonLoad,
        },
        {
          scheduledItemId: "tentative",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: true,
          linkedCompletedActivityId: null,
          commonLoad,
        },
      ],
      completedActivities: [],
      scheduledSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      completedSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "available",
      firm: { status: "complete", commonLoad: { load: 100 } },
      tentative: { status: "complete", load: 100 },
      includingTentative: { status: "complete", commonLoad: { load: 200 } },
    });
  });
});
