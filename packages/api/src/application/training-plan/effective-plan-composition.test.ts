import {
  activityObservationQuantificationSchema,
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  createScheduledEventActivityQuantificationSubjectIdentity,
} from "@repo/core";
import { calculateAvailableCommonLoad } from "@repo/core/load";
import { describe, expect, it } from "vitest";
import { composeEffectivePlanDto } from "./effective-plan-composition";

const commonLoad = calculateAvailableCommonLoad({
  activity_category: "bike",
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

const duration = {
  elapsed: {
    status: "available" as const,
    evidenceRole: "prescribed" as const,
    value: 3600,
    unit: "seconds" as const,
  },
  active: {
    status: "available" as const,
    evidenceRole: "prescribed" as const,
    value: 3600,
    unit: "seconds" as const,
  },
  moving: {
    status: "available" as const,
    evidenceRole: "prescribed" as const,
    value: 3600,
    unit: "seconds" as const,
  },
};

function prescription(id: string) {
  const planSubjectIdentity = createPlanActivityQuantificationSubjectIdentity({
    planId: `plan-${id}`,
  });
  const scheduledSubjectIdentity = createScheduledEventActivityQuantificationSubjectIdentity({
    eventId: id,
    planSubjectIdentity,
  });
  return activityPrescriptionQuantificationSchema.parse({
    kind: "prescription",
    stage: "scheduled",
    subjectIdentity: createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: `${id}-occurrence`,
      parentSubjectIdentity: scheduledSubjectIdentity,
    }),
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "plan_revision",
      sourceIds: [id],
      revisionFingerprint: `revision-${id}`,
      details: { kind: "test-prescription", id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: "bike",
    duration,
    distance: {
      status: "unavailable",
      evidenceRole: "prescribed",
      value: null,
      unit: "meters",
      reason: "not_prescribed",
    },
    intensity: {
      prescribed: {
        status: "unavailable",
        evidenceRole: "prescribed",
        values: [],
        reason: "not_authored",
      },
    },
    commonLoad,
  });
}

function observation(id: string) {
  const segmentId = `${id}-segment`;
  const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({ activityId: id });
  return activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [id, segmentId],
      revisionFingerprint: `revision-${id}`,
      details: { kind: "test-observation", id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: "bike",
    duration: {
      ...duration,
      elapsed: { ...duration.elapsed, evidenceRole: "measured" },
      active: { ...duration.active, evidenceRole: "measured" },
      moving: { ...duration.moving, evidenceRole: "measured" },
    },
    distance: {
      status: "unavailable",
      evidenceRole: "measured",
      value: null,
      unit: "meters",
      reason: "not_observed",
    },
    intensity: {
      observed: {
        status: "unavailable",
        evidenceRole: "measured",
        values: [],
        reason: "not_observed",
      },
    },
    completedProvenance: {
      activityId: id,
      segmentId,
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: commonLoad.computedAsOf,
      computedAt: commonLoad.computedAsOf,
      calculationVersion: "effective-plan-composition-test-v1",
    },
    commonLoad,
  });
}

function prescriptionBundle(id: string) {
  return createActivityPlanPrescriptionQuantificationBundle({ members: [prescription(id)] });
}

function observationBundle(id: string) {
  return createObservationQuantificationBundle({ members: [observation(id)] });
}

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
          prescriptionQuantification: prescriptionBundle("firm"),
        },
        {
          scheduledItemId: "tentative",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: true,
          linkedCompletedActivityId: null,
          prescriptionQuantification: prescriptionBundle("tentative"),
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
      firmLifecycleQuantifications: {
        prescriptions: { summary: { commonLoad: { load: 100, totalActivityCount: 1 } } },
      },
      includingTentativeLifecycleQuantifications: {
        prescriptions: { summary: { commonLoad: { load: 200, totalActivityCount: 2 } } },
      },
    });
  });

  it("makes duplicate completion links explicitly unavailable instead of counting twice", () => {
    const result = composeEffectivePlanDto({
      scheduledItems: [
        {
          scheduledItemId: "scheduled-a",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: false,
          linkedCompletedActivityId: "activity-a",
          prescriptionQuantification: prescriptionBundle("scheduled-a"),
        },
        {
          scheduledItemId: "scheduled-b",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: false,
          linkedCompletedActivityId: "activity-a",
          prescriptionQuantification: prescriptionBundle("scheduled-b"),
        },
      ],
      completedActivities: [
        {
          completedActivityId: "activity-a",
          completedDate: "2026-07-24",
          observationQuantification: observationBundle("activity-a"),
        },
      ],
      scheduledSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      completedSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "integrity_unavailable",
      reason: "duplicate_activity_to_scheduled_links",
      duplicateLinks: [
        { completedActivityId: "activity-a", scheduledItemIds: ["scheduled-a", "scheduled-b"] },
      ],
    });
  });

  it("keeps a shifted linked completion on its actual day and suppresses its separately queried scheduled day", () => {
    const completedQuantification = observation("activity-a");
    const actualDay = composeEffectivePlanDto({
      scheduledItems: [],
      completedActivities: [
        {
          completedActivityId: "activity-a",
          completedDate: "2026-07-23",
          observationQuantification: createObservationQuantificationBundle({
            members: [completedQuantification],
          }),
        },
      ],
      scheduledSource: { status: "complete", startDate: "2026-07-23", endDate: "2026-07-23" },
      completedSource: { status: "complete", startDate: "2026-07-23", endDate: "2026-07-23" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T18:00:00.000Z",
    });
    const scheduledQuantification = prescription("scheduled-a");
    const scheduledDay = composeEffectivePlanDto({
      scheduledItems: [
        {
          scheduledItemId: "scheduled-a",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: false,
          linkedCompletedActivityId: "activity-a",
          prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
            members: [scheduledQuantification],
          }),
        },
      ],
      // This mirrors the daily application filter: the linked completion is a valid persisted
      // replacement fact, but its actual date is outside this independently requested day.
      completedActivities: [],
      scheduledSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      completedSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T18:00:00.000Z",
    });

    expect(actualDay).toMatchObject({
      status: "available",
      firmItems: [
        {
          kind: "completed",
          completedActivityId: "activity-a",
          date: "2026-07-23",
          replacedScheduledItemId: null,
        },
      ],
      firm: { status: "complete", commonLoad: { load: 100, totalActivityCount: 1 } },
    });
    expect(scheduledDay).toMatchObject({
      status: "available",
      firmItems: [],
      firm: { status: "known_zero", load: 0 },
    });
    if (actualDay.status !== "available" || scheduledDay.status !== "available") {
      throw new Error("Expected both daily compositions to be available");
    }
    expect(
      actualDay.firmItems.length + scheduledDay.firmItems.length,
      "the linked execution must appear exactly once across its actual and scheduled days",
    ).toBe(1);
  });

  it("keeps replacement arithmetic effective while comparing prescription and observation lifecycles", () => {
    const planned = prescription("scheduled-a");
    const completed = observation("activity-a");
    const result = composeEffectivePlanDto({
      scheduledItems: [
        {
          scheduledItemId: "scheduled-a",
          scheduledDate: "2026-07-24",
          status: "active",
          tentative: false,
          linkedCompletedActivityId: "activity-a",
          prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
            members: [planned],
          }),
        },
      ],
      completedActivities: [
        {
          completedActivityId: "activity-a",
          completedDate: "2026-07-24",
          observationQuantification: createObservationQuantificationBundle({
            members: [completed],
          }),
        },
      ],
      scheduledSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      completedSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "available",
      firmItems: [
        {
          kind: "completed",
          completedActivityId: "activity-a",
          replacedScheduledItemId: "scheduled-a",
        },
      ],
      firm: { status: "complete", commonLoad: { load: 100, totalActivityCount: 1 } },
      firmLifecycleQuantifications: {
        prescriptions: { summary: { lifecycle: "prescription", commonLoad: { load: 100 } } },
        observations: { summary: { lifecycle: "observation", commonLoad: { load: 100 } } },
        comparison: { kind: "planned_vs_completed_comparison", commonLoadDelta: 0 },
      },
    });
  });

  it("projects a compatible parent aggregate without expanding its segment count", () => {
    const members = [observation("segment-a"), observation("segment-b")];
    const multisportParent = createObservationQuantificationBundle({ members });
    const result = composeEffectivePlanDto({
      scheduledItems: [],
      completedActivities: [
        {
          completedActivityId: "multisport-parent",
          completedDate: "2026-07-24",
          observationQuantification: multisportParent,
        },
      ],
      scheduledSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      completedSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "available",
      firm: {
        status: "complete",
        commonLoad: {
          totalActivityCount: 1,
          contributingActivityCount: 1,
          knownDurationSeconds: 7200,
          load: 200,
        },
      },
      firmLifecycleQuantifications: {
        observations: {
          summary: {
            commonLoad: {
              totalActivityCount: 2,
              contributingActivityCount: 2,
              knownDurationSeconds: 7200,
              load: 200,
            },
          },
        },
      },
    });
  });
});
