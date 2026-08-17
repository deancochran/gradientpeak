import { describe, expect, it } from "vitest";

import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  FORM_MATCH_TOLERANCE,
} from "../athlete-intelligence/state-projection";
import { thresholdSelectionDecisionSchema } from "../performance-calibration/threshold-contracts";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  activityTrainingEffectSchema,
  athleteIncrementalApplyInputSchema,
  athleteRebuildPageInputSchema,
  athleteRecalculationIdempotencyKey,
  athleteRecalculationQueueTransitionInputSchema,
  athleteRecalculationRequestSchema,
  athleteRecalculationWorkerStateSchema,
  canonicalizeAthleteRecalculationReasons,
  canTransitionAthleteRecalculationWorkerState,
  coalesceAthleteRecalculationRequests,
  dailyTrainingLoadRevisionsSchema,
  dailyTrainingLoadSchema,
  type PersistedThresholdEvidence,
  persistedThresholdEvidenceCollectionSchema,
  persistedThresholdEvidenceReplacementInputSchema,
  projectActiveRebuildThresholdEvidence,
  replacePersistedThresholdEvidence,
} from "./contracts";

const profileId = "11111111-1111-4111-8111-111111111111";
const secondActivityId = "22222222-2222-4222-8222-222222222222";

function effect(activityId = secondActivityId, effectiveAt = "2026-08-10T08:00:00.000Z") {
  return activityTrainingEffectSchema.parse({
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId,
    activityId,
    activityAnalysisRevision: 1,
    effectiveAt,
    planningDate: effectiveAt.slice(0, 10),
    sourceRevision: 8,
    calculationVersion: "common-load-v1",
    inputFingerprint: "a".repeat(64),
    stimulus: {
      kind: "observed",
      sourceId: activityId,
      occurredAt: effectiveAt,
      activityCategory: "run",
      commonLoad: 80,
      evidenceConfidence: 0.9,
      capabilityObservation: null,
    },
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return athleteRecalculationRequestSchema.parse({
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId,
    idempotencyKey: athleteRecalculationIdempotencyKey(profileId),
    earliestAffectedAt: "2026-08-10T08:00:00.000Z",
    earliestAffectedPlanningDate: "2026-08-10",
    sourceRevision: 8,
    reasons: ["activity_changed"],
    requestedAt: "2026-08-10T09:00:00.000Z",
    ...overrides,
  });
}

const baseline = {
  contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  athleteId: profileId,
  stateRevision: 7,
  asOf: "2026-08-10T07:00:00.000Z",
  longTermLoad: 45,
  recentLoad: 50,
  loadBalance: -5,
  evidenceConfidence: 0.8,
  capabilities: [],
  athleteAgeYears: 35,
};

function persistedEvidence(overrides: Record<string, unknown> = {}): PersistedThresholdEvidence {
  return {
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId,
    calculationVersion: "threshold-policy-v1",
    confidence: 0.9,
    evidence: {
      evidenceId: "55555555-5555-4555-8555-555555555555",
      activityId: secondActivityId,
      activityCategory: "run",
      metric: "speed",
      unit: "meters_per_second",
      method: "run_speed_30m",
      value: 4,
      sourceSeriesId: "speed",
      sourceSeriesMetric: "speed",
      startTimestampSeconds: 0,
      endTimestampSeconds: 1800,
      exactWindowSeconds: 1800,
      conversionFactor: 1,
      policyVersion: "threshold-policy-v1",
      plausibilityVersion: "threshold-plausibility-v1",
      observedAt: "2026-08-10T08:00:00.000Z",
    },
    lifecycle: { status: "active", invalidatedAt: null },
    ...overrides,
  };
}

describe("planned athlete-derived-state persistence contracts", () => {
  it("binds one effect's identity, observed stimulus, timestamp, version, and fingerprint", () => {
    expect(effect().activityId).toBe(secondActivityId);
    expect(
      activityTrainingEffectSchema.safeParse({
        ...effect(),
        activityAnalysisRevision: 0,
      }).success,
    ).toBe(false);
    expect(
      activityTrainingEffectSchema.safeParse({ ...effect(), sourceRevision: -1 }).success,
    ).toBe(false);
    expect(
      activityTrainingEffectSchema.safeParse({
        ...effect(),
        stimulus: { ...effect().stimulus, sourceId: profileId },
      }).success,
    ).toBe(false);
    expect(
      activityTrainingEffectSchema.safeParse({
        ...effect(),
        calculationVersion: "Common Load latest",
      }).success,
    ).toBe(false);
    expect(
      activityTrainingEffectSchema.safeParse({
        ...effect(),
        inputFingerprint: "A".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      activityTrainingEffectSchema.safeParse({
        ...effect(),
        stimulus: { ...effect().stimulus, occurredAt: "2026-08-10T08:01:00.000Z" },
      }).success,
    ).toBe(false);
  });

  it("requires a revisioned daily-load identity and finite, internally consistent state", () => {
    const value = {
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      planningDate: "2026-08-10",
      commonLoad: 80,
      fitness: 45,
      fatigue: 50,
      form: -5,
      readiness: 70,
      coverage: { status: "complete", contributingActivityCount: 1, omittedActivityCount: 0 },
      sourceRevision: 8,
      calculationVersion: "common-load-v1",
    };
    expect(dailyTrainingLoadSchema.parse(value)).toEqual(value);
    expect(dailyTrainingLoadSchema.safeParse({ ...value, form: 0 }).success).toBe(false);
    expect(dailyTrainingLoadSchema.safeParse({ ...value, sourceRevision: -1 }).success).toBe(false);
    expect(dailyTrainingLoadSchema.safeParse({ ...value, commonLoad: Number.NaN }).success).toBe(
      false,
    );
    expect(
      dailyTrainingLoadSchema.safeParse({ ...value, fitness: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
    expect(dailyTrainingLoadSchema.safeParse({ ...value, fatigue: Number.NaN }).success).toBe(
      false,
    );
    expect(
      dailyTrainingLoadSchema.safeParse({ ...value, readiness: Number.NEGATIVE_INFINITY }).success,
    ).toBe(false);
  });

  it("matches form at the database tolerance boundary and rejects invalid numbers", () => {
    const value = {
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      planningDate: "2026-08-10",
      commonLoad: 80,
      fitness: 1,
      fatigue: 0,
      form: 1,
      readiness: null,
      coverage: { status: "complete", contributingActivityCount: 1, omittedActivityCount: 0 },
      sourceRevision: 8,
      calculationVersion: "common-load-v1",
    };

    expect(dailyTrainingLoadSchema.safeParse(value).success).toBe(true);
    expect(
      dailyTrainingLoadSchema.safeParse({
        ...value,
        form: 1 - FORM_MATCH_TOLERANCE / 10,
      }).success,
    ).toBe(true);
    expect(
      dailyTrainingLoadSchema.safeParse({
        ...value,
        fitness: 0,
        fatigue: 0,
        form: FORM_MATCH_TOLERANCE,
      }).success,
    ).toBe(true);
    expect(
      dailyTrainingLoadSchema.safeParse({
        ...value,
        form: 1 + FORM_MATCH_TOLERANCE * 1.1,
      }).success,
    ).toBe(false);
    expect(
      dailyTrainingLoadSchema.safeParse({ ...value, fitness: 0.3, fatigue: 0.2, form: 0.1 })
        .success,
    ).toBe(true);

    for (const field of ["fitness", "fatigue", "form"] as const) {
      expect(dailyTrainingLoadSchema.safeParse({ ...value, [field]: Number.NaN }).success).toBe(
        false,
      );
      expect(
        dailyTrainingLoadSchema.safeParse({ ...value, [field]: Number.POSITIVE_INFINITY }).success,
      ).toBe(false);
      expect(
        dailyTrainingLoadSchema.safeParse({ ...value, [field]: Number.NEGATIVE_INFINITY }).success,
      ).toBe(false);
    }
  });

  it("preserves coverage semantics and keeps same-day revisions distinct and ordered", () => {
    const firstRevision = dailyTrainingLoadSchema.parse({
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId,
      planningDate: "2026-08-10",
      commonLoad: 80,
      fitness: 45,
      fatigue: 50,
      form: -5,
      readiness: null,
      coverage: { status: "partial", contributingActivityCount: 1, omittedActivityCount: 2 },
      sourceRevision: 7,
      calculationVersion: "common-load-v1",
    });
    const secondRevision = dailyTrainingLoadSchema.parse({ ...firstRevision, sourceRevision: 8 });

    expect(dailyTrainingLoadRevisionsSchema.parse([firstRevision, secondRevision])).toEqual([
      firstRevision,
      secondRevision,
    ]);
    expect(
      dailyTrainingLoadRevisionsSchema.safeParse([secondRevision, firstRevision]).success,
    ).toBe(false);
    expect(
      dailyTrainingLoadSchema.safeParse({
        ...firstRevision,
        coverage: { status: "complete", contributingActivityCount: 1, omittedActivityCount: 1 },
      }).success,
    ).toBe(false);
    expect(
      dailyTrainingLoadSchema.safeParse({
        ...firstRevision,
        coverage: { status: "partial", contributingActivityCount: 1, omittedActivityCount: 0 },
      }).success,
    ).toBe(false);
  });

  it("coalesces rebuild requests commutatively at the earliest affected point", () => {
    const older = request({
      earliestAffectedAt: "2026-08-01T08:00:00.000Z",
      earliestAffectedPlanningDate: "2026-08-01",
      sourceRevision: 9,
      reasons: ["activity_deleted"],
      requestedAt: "2026-08-10T10:00:00.000Z",
    });
    const merged = coalesceAthleteRecalculationRequests(request(), older);
    expect(merged).toEqual(coalesceAthleteRecalculationRequests(older, request()));
    expect(merged).toMatchObject({
      earliestAffectedAt: "2026-08-01T08:00:00.000Z",
      earliestAffectedPlanningDate: "2026-08-01",
      sourceRevision: 9,
      reasons: ["activity_changed", "activity_deleted"],
      requestedAt: "2026-08-10T09:00:00.000Z",
    });
  });

  it("rejects cross-profile coalescing and keeps the idempotency key profile-derived", () => {
    const anotherProfileId = "44444444-4444-4444-8444-444444444444";
    const anotherRequest = request({
      profileId: anotherProfileId,
      idempotencyKey: athleteRecalculationIdempotencyKey(anotherProfileId),
    });

    expect(() => coalesceAthleteRecalculationRequests(request(), anotherRequest)).toThrow(
      "different athletes",
    );
    expect(
      athleteRecalculationRequestSchema.safeParse({
        ...request(),
        idempotencyKey: "caller-controlled",
      }).success,
    ).toBe(false);
  });

  it("requires canonical unique reasons and makes a coalesced reason set canonical", () => {
    expect(
      canonicalizeAthleteRecalculationReasons(["timezone_changed", "activity_changed"]),
    ).toEqual(["activity_changed", "timezone_changed"]);
    expect(
      athleteRecalculationRequestSchema.safeParse({
        ...request(),
        reasons: ["timezone_changed", "activity_changed"],
      }).success,
    ).toBe(false);
    expect(
      athleteRecalculationRequestSchema.safeParse({
        ...request(),
        reasons: ["activity_changed", "activity_changed"],
      }).success,
    ).toBe(false);
  });

  it("keeps claim and retry invariants in the worker-state boundary", () => {
    const claim = {
      action: "claim",
      expectedState: "pending",
      claimToken: "recalculation_claim_abcdefghijklmnopqrstuvwxyz",
      claimedAt: "2026-08-10T10:00:00.000Z",
      leaseExpiresAt: "2026-08-10T10:05:00.000Z",
    };
    expect(athleteRecalculationQueueTransitionInputSchema.safeParse(claim).success).toBe(true);
    expect(
      athleteRecalculationQueueTransitionInputSchema.safeParse({
        ...claim,
        leaseExpiresAt: claim.claimedAt,
      }).success,
    ).toBe(false);
    expect(
      athleteRecalculationQueueTransitionInputSchema.safeParse({
        ...claim,
        expectedState: "processing",
      }).success,
    ).toBe(false);
    expect(
      athleteRecalculationQueueTransitionInputSchema.safeParse({
        action: "retry",
        claimToken: claim.claimToken,
        failureCode: "internal",
        failedAt: claim.claimedAt,
        nextAttemptAt: claim.claimedAt,
      }).success,
    ).toBe(false);
    expect(canTransitionAthleteRecalculationWorkerState("pending", "processing")).toBe(true);
    expect(canTransitionAthleteRecalculationWorkerState("processing", "retry_wait")).toBe(true);
    expect(canTransitionAthleteRecalculationWorkerState("retry_wait", "processing")).toBe(true);
    expect(canTransitionAthleteRecalculationWorkerState("failed_terminal", "processing")).toBe(
      false,
    );
  });

  it("requires completion to name the resulting published revision without publishing", () => {
    const completion = {
      action: "complete",
      claimToken: "recalculation_claim_abcdefghijklmnopqrstuvwxyz",
      completedAt: "2026-08-10T10:05:00.000Z",
      resultingPublishedRevision: 8,
    };
    expect(athleteRecalculationQueueTransitionInputSchema.safeParse(completion).success).toBe(true);
    expect(
      athleteRecalculationQueueTransitionInputSchema.safeParse({
        ...completion,
        resultingPublishedRevision: undefined,
      }).success,
    ).toBe(false);
    expect(
      athleteRecalculationWorkerStateSchema.parse({
        state: "completed",
        completedAt: completion.completedAt,
        resultingPublishedRevision: completion.resultingPublishedRevision,
      }),
    ).toMatchObject({ state: "completed", resultingPublishedRevision: 8 });
  });

  it("routes older evidence away from incremental publication", () => {
    expect(
      athleteIncrementalApplyInputSchema.safeParse({
        profileId,
        expectedPublishedRevision: 7,
        targetSourceRevision: 8,
        currentState: baseline,
        effect: effect(),
      }).success,
    ).toBe(true);
    expect(
      athleteIncrementalApplyInputSchema.safeParse({
        profileId,
        expectedPublishedRevision: 7,
        targetSourceRevision: 8,
        currentState: baseline,
        effect: effect(secondActivityId, "2026-08-09T08:00:00.000Z"),
      }).success,
    ).toBe(false);
  });

  it("requires deterministic effect ordering for a bounded rebuild page", () => {
    const first = effect("33333333-3333-4333-8333-333333333333", "2026-08-10T07:30:00.000Z");
    const second = effect();
    const rebuild = {
      request: request(),
      baseState: baseline,
      targetSourceRevision: 8,
      after: null,
      isFinalPage: true,
      effects: [first, second],
      thresholdEvidence: [],
    };
    expect(athleteRebuildPageInputSchema.safeParse(rebuild).success).toBe(true);
    expect(
      athleteRebuildPageInputSchema.safeParse({ ...rebuild, effects: [second, first] }).success,
    ).toBe(false);
    expect(
      athleteRebuildPageInputSchema.safeParse({
        ...rebuild,
        after: {
          effectiveAt: second.effectiveAt,
          activityId: second.activityId,
          activityAnalysisRevision: second.activityAnalysisRevision,
        },
      }).success,
    ).toBe(false);
  });

  it("keeps one persisted threshold candidate per athlete activity identity", () => {
    const first = persistedEvidence();
    const duplicateIdentity = persistedEvidence({
      evidence: { ...first.evidence, evidenceId: "66666666-6666-4666-8666-666666666666" },
      lifecycle: { status: "superseded", invalidatedAt: "2026-08-10T09:00:00.000Z" },
    });

    expect(
      persistedThresholdEvidenceCollectionSchema.safeParse([first, duplicateIdentity]).success,
    ).toBe(false);
  });

  it("replaces persisted evidence only at its stable athlete activity identity", () => {
    const first = persistedEvidence();
    const replacement = persistedEvidence({
      evidence: {
        ...first.evidence,
        evidenceId: "66666666-6666-4666-8666-666666666666",
        value: 4.1,
      },
    });
    const input = {
      existingEvidence: [first],
      replacedEvidenceId: first.evidence.evidenceId,
      replacementEvidence: replacement,
    };

    expect(persistedThresholdEvidenceReplacementInputSchema.safeParse(input).success).toBe(true);
    expect(replacePersistedThresholdEvidence(input)).toEqual([replacement]);
    expect(
      persistedThresholdEvidenceReplacementInputSchema.safeParse({
        ...input,
        replacementEvidence: persistedEvidence({
          evidence: { ...replacement.evidence, activityId: "77777777-7777-4777-8777-777777777777" },
        }),
      }).success,
    ).toBe(false);
  });

  it("projects only active persisted rebuild evidence into threshold selection", () => {
    const active = persistedEvidence();
    const superseded = persistedEvidence({
      evidence: {
        ...active.evidence,
        evidenceId: "66666666-6666-4666-8666-666666666666",
        activityId: "77777777-7777-4777-8777-777777777777",
      },
      lifecycle: { status: "superseded", invalidatedAt: "2026-08-10T09:00:00.000Z" },
    });
    const deleted = persistedEvidence({
      evidence: {
        ...active.evidence,
        evidenceId: "88888888-8888-4888-8888-888888888888",
        activityId: "99999999-9999-4999-8999-999999999999",
      },
      lifecycle: { status: "deleted", invalidatedAt: "2026-08-10T09:00:00.000Z" },
    });

    expect(projectActiveRebuildThresholdEvidence([active, superseded, deleted])).toEqual([
      active.evidence,
    ]);
  });

  it("rejects a threshold decision that selects the same evidence twice", () => {
    expect(
      thresholdSelectionDecisionSchema.safeParse({
        activityCategory: "run",
        metric: "speed",
        unit: "meters_per_second",
        method: "run_speed_30m",
        value: 4,
        effectiveAt: "2026-08-10T08:00:00.000Z",
        policyVersion: "threshold-policy-v1",
        plausibilityVersion: "threshold-plausibility-v1",
        selectedEvidenceIds: ["same-evidence", "same-evidence"],
        selectedActivityIds: [secondActivityId, "77777777-7777-4777-8777-777777777777"],
        publicationReason: "independent_confirmation",
      }).success,
    ).toBe(false);
  });
});
