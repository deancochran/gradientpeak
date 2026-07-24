import { describe, expect, it } from "vitest";
import {
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  calculateAvailableCommonLoad,
} from "../../load";
import {
  composeEffectivePlanLoad,
  type EffectiveCompositionInput,
  type EffectiveScheduledItem,
  effectiveCompositionInputSchema,
} from "../effective-composition";
import { composeEffectivePlanLoad as composeFromRoot } from "../index";

const computedAsOf = "2026-07-21T12:00:00.000Z";

function available(durationSeconds: number, intensity: number): CommonLoadResult {
  return calculateAvailableCommonLoad({
    sport: "bike",
    method: "power_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-07-20T12:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-power",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-07-20T12:00:00.000Z",
      validAt: "2026-07-20T12:00:00.000Z",
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-power",
    },
    evidenceFingerprint: "activity-power",
    computedAsOf,
    estimated: false,
    contributingDurationSeconds: durationSeconds,
    intensity,
  });
}

function unavailable(durationSeconds: number | null = 3600): CommonLoadResult {
  return {
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: "bike",
    method: null,
    quality: null,
    thresholdEvidence: null,
    sessionRpeEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    contributingDurationSeconds: durationSeconds,
    reason: durationSeconds === null ? "duration_missing" : "activity_data_missing",
  };
}

function scheduled(
  scheduledItemId: string,
  scheduledDate: string,
  commonLoad: EffectiveScheduledItem["commonLoad"],
  overrides: Partial<EffectiveScheduledItem> = {},
): EffectiveScheduledItem {
  return {
    scheduledItemId,
    scheduledDate,
    status: "active",
    tentative: false,
    linkedCompletedActivityId: null,
    commonLoad,
    ...overrides,
  };
}

function input(overrides: Partial<EffectiveCompositionInput> = {}): EffectiveCompositionInput {
  return {
    scheduledItems: [],
    completedActivities: [],
    scheduledSource: { status: "complete", startDate: "2026-07-20", endDate: "2026-07-26" },
    completedSource: { status: "complete", startDate: "2026-07-20", endDate: "2026-07-26" },
    planningTimezone: "UTC",
    asOfInstant: computedAsOf,
    ...overrides,
  };
}

function composed(result: ReturnType<typeof composeEffectivePlanLoad>) {
  expect(result.status).toBe("composed");
  if (result.status !== "composed") throw new Error("Expected composed result");
  return result;
}

describe("effective Plan Load composition", () => {
  it("exports the public composition function", () => {
    expect(composeFromRoot).toBe(composeEffectivePlanLoad);
  });

  it("replaces one linked scheduled item with its completed activity exactly once", () => {
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [
            scheduled("plan-1", "2026-07-22", available(3600, 1), {
              linkedCompletedActivityId: "activity-1",
            }),
          ],
          completedActivities: [
            {
              completedActivityId: "activity-1",
              completedDate: "2026-07-21",
              commonLoad: available(1800, 1),
            },
          ],
        }),
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "completed",
        completedActivityId: "activity-1",
        date: "2026-07-22",
        replacedScheduledItemId: "plan-1",
      }),
    ]);
    expect(result.aggregate).toMatchObject({
      status: "complete",
      commonLoad: { load: 50, totalActivityCount: 1 },
    });
  });

  it("retains a compatible multisport parent aggregate as one completed item", () => {
    const parentAggregate = aggregateCommonLoad([available(1800, 0.5), available(3600, 1)]);
    const result = composed(
      composeEffectivePlanLoad(
        input({
          completedActivities: [
            {
              completedActivityId: "multisport-1",
              completedDate: "2026-07-21",
              commonLoad: parentAggregate,
            },
          ],
        }),
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "completed",
        completedActivityId: "multisport-1",
        commonLoad: parentAggregate,
      }),
    ]);
    expect(result.aggregate).toMatchObject({
      status: "complete",
      commonLoad: {
        totalActivityCount: 1,
        contributingActivityCount: 1,
        contributingDurationSeconds: 5400,
        knownDurationSeconds: 5400,
        load: 112.5,
      },
    });
    if (result.aggregate.status !== "complete") throw new Error("Expected complete aggregate");
    if (result.aggregate.commonLoad.status === "unavailable") {
      throw new Error("Expected known common Load aggregate");
    }
    expect(result.aggregate.commonLoad.intensity).toBeCloseTo(Math.sqrt(112.5 / 150), 12);
  });

  it("retains a compatible multisport parent aggregate as one planned item", () => {
    const parentAggregate = aggregateCommonLoad([available(1800, 0.5), available(3600, 1)]);
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [scheduled("multisport-plan", "2026-07-22", parentAggregate)],
        }),
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "scheduled",
        scheduledItemId: "multisport-plan",
        commonLoad: parentAggregate,
      }),
    ]);
    expect(result.aggregate).toMatchObject({
      status: "complete",
      commonLoad: {
        totalActivityCount: 1,
        contributingActivityCount: 1,
        knownDurationSeconds: 5400,
        load: 112.5,
      },
    });
  });

  it("keeps standalone completed activity plus unrelated active plan work", () => {
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [scheduled("plan-1", "2026-07-22", available(3600, 1))],
          completedActivities: [
            {
              completedActivityId: "activity-1",
              completedDate: "2026-07-20",
              commonLoad: available(1800, 0.5),
            },
          ],
        }),
      ),
    );

    expect(result.items.map((item) => item.kind)).toEqual(["scheduled", "completed"]);
    expect(result.aggregate).toMatchObject({
      status: "complete",
      commonLoad: { load: 112.5, totalActivityCount: 2 },
    });
  });

  it("assigns a linked completion only to its scheduled day across day compositions", () => {
    const scheduledItems = [
      scheduled("plan-1", "2026-07-22", available(3600, 1), {
        linkedCompletedActivityId: "activity-1",
      }),
    ];
    const completedActivities = [
      {
        completedActivityId: "activity-1",
        completedDate: "2026-07-21",
        commonLoad: available(1800, 1),
      },
    ];
    const day = (date: string) =>
      composed(
        composeEffectivePlanLoad({
          ...input({ scheduledItems, completedActivities }),
          scheduledSource: { status: "complete", startDate: date, endDate: date },
          completedSource: { status: "complete", startDate: date, endDate: date },
        }),
      );

    expect(day("2026-07-21").aggregate).toEqual({
      status: "known_zero",
      load: 0,
      intensity: null,
    });
    expect(day("2026-07-22").aggregate).toMatchObject({
      status: "complete",
      commonLoad: { load: 50, totalActivityCount: 1 },
    });
  });

  it("returns deterministic integrity-unavailable details for duplicate activity links", () => {
    const duplicateLinkedItems = [
      scheduled("plan-b", "2026-08-22", available(3600, 1), {
        linkedCompletedActivityId: "activity-1",
      }),
      scheduled("plan-a", "2026-07-21", available(3600, 1), {
        linkedCompletedActivityId: "activity-1",
      }),
    ];
    const linkedActivity = {
      completedActivityId: "activity-1",
      completedDate: "2026-07-21",
      commonLoad: available(1800, 1),
    };
    const first = composeEffectivePlanLoad(
      input({ scheduledItems: duplicateLinkedItems, completedActivities: [linkedActivity] }),
    );
    const reordered = composeEffectivePlanLoad(
      input({
        scheduledItems: [...duplicateLinkedItems].reverse(),
        completedActivities: [linkedActivity],
      }),
    );

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      status: "integrity_unavailable",
      reason: "duplicate_activity_to_scheduled_links",
      duplicateLinks: [
        { completedActivityId: "activity-1", scheduledItemIds: ["plan-a", "plan-b"] },
      ],
    });
  });

  it("excludes cancelled and past unlinked work but includes today and future active work", () => {
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [
            scheduled("cancelled", "2026-07-22", available(3600, 1), { status: "cancelled" }),
            scheduled("past", "2026-07-20", available(3600, 1)),
            scheduled("today", "2026-07-21", available(1800, 1)),
            scheduled("future", "2026-07-26", available(900, 1)),
          ],
        }),
      ),
    );

    expect(
      result.items.map((item) => (item.kind === "scheduled" ? item.scheduledItemId : "")),
    ).toEqual(["future", "today"]);
    expect(result.aggregate).toMatchObject({
      status: "complete",
      commonLoad: { load: 75, totalActivityCount: 2 },
    });
  });

  it("excludes tentative work from default and aggregates it as a separate overlay", () => {
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [
            scheduled("firm", "2026-07-22", available(3600, 1)),
            scheduled("tentative", "2026-07-23", available(1800, 0.5), { tentative: true }),
          ],
        }),
      ),
    );

    expect(result.items).toHaveLength(1);
    expect(result.tentativeItems.map((item) => item.scheduledItemId)).toEqual(["tentative"]);
    expect(result.aggregate).toMatchObject({ status: "complete", commonLoad: { load: 100 } });
    expect(result.tentativeAggregate).toMatchObject({ status: "complete", load: 12.5 });
    expect(result.includingTentativeAggregate).toMatchObject({
      status: "complete",
      commonLoad: { load: 112.5 },
    });
  });

  it("retains unavailable completed work and reports partial or unavailable aggregation", () => {
    const partialResult = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [scheduled("future", "2026-07-22", available(3600, 1))],
          completedActivities: [
            {
              completedActivityId: "unavailable",
              completedDate: "2026-07-20",
              commonLoad: unavailable(),
            },
          ],
        }),
      ),
    );
    const unavailableResult = composed(
      composeEffectivePlanLoad(
        input({
          completedActivities: [
            {
              completedActivityId: "unavailable",
              completedDate: "2026-07-20",
              commonLoad: unavailable(null),
            },
          ],
        }),
      ),
    );

    expect(partialResult.items).toEqual([
      expect.anything(),
      expect.objectContaining({ completedActivityId: "unavailable", commonLoad: unavailable() }),
    ]);
    expect(partialResult.aggregate).toMatchObject({
      status: "partial",
      commonLoad: { status: "partial", unavailableActivityCount: 1 },
    });
    expect(unavailableResult.aggregate).toMatchObject({
      status: "unavailable",
      reason: "common_load_unavailable",
      commonLoad: { status: "unavailable", totalActivityCount: 1 },
    });
  });

  it("uses aggregateCommonLoad duration-weighted RMS Intensity across a weekly period", () => {
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledItems: [
            scheduled("short-easy", "2026-07-21", available(3600, 0.5)),
            scheduled("long-hard", "2026-07-26", available(10_800, 1)),
          ],
        }),
      ),
    );

    expect(result.periodStartDate).toBe("2026-07-20");
    expect(result.periodEndDate).toBe("2026-07-26");
    expect(result.aggregate.status).toBe("complete");
    if (result.aggregate.status !== "complete") throw new Error("Expected complete aggregate");
    if (result.aggregate.commonLoad.status === "unavailable") {
      throw new Error("Expected known common Load aggregate");
    }
    expect(result.aggregate.commonLoad.load).toBe(325);
    expect(result.aggregate.commonLoad.intensity).toBeCloseTo(Math.sqrt(325 / 400), 12);
    expect(result.aggregate.commonLoad.intensity).not.toBe(0.75);
  });

  it("derives today from the planning timezone around an instant day boundary", () => {
    const boundaryInput = input({
      scheduledItems: [scheduled("boundary", "2026-07-20", available(3600, 1))],
      asOfInstant: "2026-07-21T00:30:00.000Z",
    });
    const losAngeles = composed(
      composeEffectivePlanLoad({ ...boundaryInput, planningTimezone: "America/Los_Angeles" }),
    );
    const tokyo = composed(
      composeEffectivePlanLoad({ ...boundaryInput, planningTimezone: "Asia/Tokyo" }),
    );

    expect(losAngeles.planningDate).toBe("2026-07-20");
    expect(losAngeles.items).toHaveLength(1);
    expect(tokyo.planningDate).toBe("2026-07-21");
    expect(tokyo.items).toHaveLength(0);
  });

  it("reports known zero only when the bounded completed source is complete", () => {
    const complete = composed(composeEffectivePlanLoad(input()));
    const incomplete = composed(
      composeEffectivePlanLoad(
        input({
          completedSource: {
            status: "incomplete",
            reason: "fetch_partial",
            startDate: "2026-07-20",
            endDate: "2026-07-26",
          },
        }),
      ),
    );

    expect(complete.aggregate).toEqual({ status: "known_zero", load: 0, intensity: null });
    expect(incomplete.aggregate).toMatchObject({
      status: "unavailable",
      reason: "completed_source_incomplete",
      commonLoad: { status: "unavailable", totalActivityCount: 0 },
    });
  });

  it("does not report complete or known-zero Load from an incomplete scheduled source", () => {
    const result = composed(
      composeEffectivePlanLoad(
        input({
          scheduledSource: {
            status: "incomplete",
            reason: "fetch_partial",
            startDate: "2026-07-20",
            endDate: "2026-07-26",
          },
        }),
      ),
    );

    expect(result.aggregate).toMatchObject({
      status: "unavailable",
      reason: "scheduled_source_incomplete",
    });
  });

  it("rejects non-strict, invalid calendar, timezone, and reversed bounded inputs", () => {
    expect(effectiveCompositionInputSchema.safeParse({ ...input(), extra: true }).success).toBe(
      false,
    );
    expect(
      effectiveCompositionInputSchema.safeParse({ ...input(), planningTimezone: "Not/AZone" })
        .success,
    ).toBe(false);
    expect(
      effectiveCompositionInputSchema.safeParse({
        ...input(),
        completedSource: { status: "complete", startDate: "2026-02-30", endDate: "2026-02-28" },
      }).success,
    ).toBe(false);
  });
});
