import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import superjson from "superjson";
import { describe, expect, it } from "vitest";
import { createResolutionManifestFixture } from "../test/builders/planned-session";
import { activityIngestionSafeStatusDtoSchema } from "./activity-ingestion";
import { plannedSessionDtoSchema } from "./planned-sessions";
import { thresholdEvidenceExplanationDtoSchema } from "./threshold-evidence";
import { trainingEffectDtoSchema } from "./training-effects";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const now = "2026-08-10T08:00:00.000Z";
const structure = activityPlanStructureSchema.parse({
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step",
      id: id(3),
      name: "Steady",
      duration: { type: "time" as const, seconds: 1800 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    },
  ],
});
const plannedSession = (lifecycle: unknown) => ({
  id: id(10),
  profileId: id(11),
  sessionRevision: 2,
  planningDate: "2026-08-10",
  originalTargetDate: "2026-08-10",
  source: { kind: "direct" as const, operationId: "a".repeat(32) },
  groupEventId: null,
  activityPlanId: id(12),
  prescription: {
    resolutionManifest: createResolutionManifestFixture({
      activityPlanId: id(12),
      structure,
      demand: {
        activity_category: "run",
        training_intent: "general_maintenance",
        target_duration_minutes: 30,
        target_common_load: null,
        importance: "normal",
      },
    }),
    capturedAt: now,
  },
  lifecycle,
});
const ingestionBase = {
  ingestionId: id(20),
  profileId: id(11),
  operationId: "b".repeat(32),
  source: "manual_import" as const,
  activityId: null,
  artifactId: null,
  requestedAt: now,
  updatedAt: now,
};
describe("Phase 5 public DTOs", () => {
  it.each([
    { status: "scheduled" },
    { status: "cancelled", reason: "user_requested", cancelledAt: now },
    {
      status: "completed",
      completion: { state: "linked", activityId: id(30), linkedAt: now },
    },
    {
      status: "completed",
      completion: { state: "activity_deleted", linkedAt: now, unlinkedAt: now },
    },
  ])("accepts the planned-session lifecycle variant %#", (lifecycle) => {
    expect(plannedSessionDtoSchema.safeParse(plannedSession(lifecycle)).success).toBe(true);
  });
  it("accepts a new reference-based session with no legacy prescription", () => {
    const { prescription: _prescription, ...newSession } = plannedSession({ status: "scheduled" });
    expect(plannedSessionDtoSchema.parse(newSession)).toEqual(newSession);
  });
  it.each([
    {
      ...ingestionBase,
      status: "awaiting_upload",
      startedAt: null,
      actions: { retry: false },
    },
    {
      ...ingestionBase,
      status: "processing",
      startedAt: now,
      actions: { retry: false },
    },
    {
      ...ingestionBase,
      status: "failed_retryable",
      failureCode: "dependency_unavailable",
      failedAt: now,
      actions: { retry: true },
    },
    {
      ...ingestionBase,
      status: "succeeded",
      activityId: id(31),
      artifactId: id(32),
      completedAt: now,
      actions: { retry: false },
    },
    {
      ...ingestionBase,
      status: "failed_terminal",
      failureCode: "invalid_activity",
      failedAt: now,
      actions: { retry: false },
    },
  ])("accepts the safe ingestion lifecycle variant %#", (status) => {
    expect(activityIngestionSafeStatusDtoSchema.safeParse(status).success).toBe(true);
  });
  it("rejects persistence and worker-only fields instead of silently stripping them", () => {
    expect(
      plannedSessionDtoSchema.safeParse({
        ...plannedSession({ status: "scheduled" }),
        idempotencyKey: "private",
      }).success,
    ).toBe(false);
    expect(
      activityIngestionSafeStatusDtoSchema.safeParse({
        ...ingestionBase,
        status: "processing",
        startedAt: now,
        actions: { retry: false },
        claimToken: "private-worker-claim",
        stagingPath: "private/path.fit",
        rawError: "private error",
      }).success,
    ).toBe(false);
  });
  it("keeps user-visible effect and evidence fields strict", () => {
    const effect = {
      activityId: id(40),
      activityAnalysisRevision: 2,
      effectiveAt: now,
      planningDate: "2026-08-10",
      calculationVersion: "v1",
      activityCategory: "run",
      commonLoad: 42.5,
      evidenceConfidence: 0.8,
      capabilityObservation: { distanceMeters: 10000, durationMinutes: 50 },
    };
    const evidence = {
      evidenceId: id(41),
      activityId: id(40),
      activityCategory: "run",
      metric: "speed",
      unit: "meters_per_second",
      method: "run_speed_30m",
      value: 4.25,
      observedAt: now,
      confidence: 0.9,
      calculationVersion: "v1",
      policyVersion: "threshold-policy-v1",
    };
    expect(trainingEffectDtoSchema.parse(effect)).toEqual(effect);
    expect(thresholdEvidenceExplanationDtoSchema.parse(evidence)).toEqual(evidence);
    expect(
      trainingEffectDtoSchema.safeParse({ ...effect, inputFingerprint: "c".repeat(64) }).success,
    ).toBe(false);
    expect(
      thresholdEvidenceExplanationDtoSchema.safeParse({
        ...evidence,
        lifecycle: { status: "active" },
      }).success,
    ).toBe(false);
  });
  it("round-trips date identities and finite numeric values through the API transformer", () => {
    const dto = plannedSessionDtoSchema.parse(plannedSession({ status: "scheduled" }));
    const envelope = { dto, generatedAt: new Date(now), load: 42.5 };
    expect(superjson.parse(superjson.stringify(envelope))).toEqual(envelope);
  });
});
