import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import type { z } from "zod";
import { createResolutionManifestFixture } from "../test/builders/planned-session";
import type { activityIngestionSafeStatusDtoSchema } from "./activity-ingestion";
import type { athleteRecalculationRepairReceiptSchema } from "./athlete-load-range";
import type {
  plannedSessionDtoSchema,
  plannedSessionMutationReceiptSchema,
  plannedSessionRangeDtoSchema,
} from "./planned-sessions";
import type {
  thresholdEvidencePageDtoSchema,
  thresholdEvidenceRequestSchema,
} from "./threshold-evidence";
import type {
  trainingEffectsPageDtoSchema,
  trainingEffectsRequestSchema,
} from "./training-effects";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-08-10T08:00:00.000Z";
type PlannedSessionFixture = z.input<typeof plannedSessionDtoSchema>;
type TrainingEffectsRequestFixture = z.input<typeof trainingEffectsRequestSchema>;
type TrainingEffectsPageFixture = z.input<typeof trainingEffectsPageDtoSchema>;
type ThresholdEvidenceRequestFixture = z.input<typeof thresholdEvidenceRequestSchema>;
type ThresholdEvidencePageFixture = z.input<typeof thresholdEvidencePageDtoSchema>;
type CursorContinuationFixture<TRequest, TPage> = {
  initialRequest: TRequest;
  firstPage: TPage;
  continuationRequest: TRequest;
  continuationPage: TPage;
};
function tuple<const T extends readonly unknown[]>(values: T): T {
  return values;
}
export const TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE = {
  initialRequest: {
    profileId: PROFILE_ID,
    fromEffectiveAt: "2026-08-01T00:00:00.000Z",
    limit: 1,
  },
  firstPage: {
    items: [
      {
        activityId: "00000000-0000-4000-8000-000000000010",
        activityAnalysisRevision: 2,
        effectiveAt: "2026-08-09T08:00:00.000Z",
        planningDate: "2026-08-09",
        calculationVersion: "training-effect-v1",
        activityCategory: "run",
        commonLoad: 42.5,
        evidenceConfidence: 0.8,
        capabilityObservation: { distanceMeters: 10000, durationMinutes: 50 },
      },
    ],
    hasMore: true,
  },
  continuationRequest: {
    profileId: PROFILE_ID,
    fromEffectiveAt: "2026-08-01T00:00:00.000Z",
    limit: 1,
    after: {
      effectiveAt: "2026-08-09T08:00:00.000Z",
      activityId: "00000000-0000-4000-8000-000000000010",
      activityAnalysisRevision: 2,
    },
  },
  continuationPage: {
    items: [
      {
        activityId: "00000000-0000-4000-8000-000000000012",
        activityAnalysisRevision: 1,
        effectiveAt: NOW,
        planningDate: "2026-08-10",
        calculationVersion: "training-effect-v1",
        activityCategory: "run",
        commonLoad: 30,
        evidenceConfidence: 0.75,
        capabilityObservation: { distanceMeters: 5000, durationMinutes: 25 },
      },
    ],
    hasMore: false,
  },
} satisfies CursorContinuationFixture<TrainingEffectsRequestFixture, TrainingEffectsPageFixture>;
export const TRAINING_EFFECTS_PAGE_V1_FIXTURE =
  TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.firstPage;
export const THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE = {
  initialRequest: {
    profileId: PROFILE_ID,
    fromObservedAt: "2026-08-01T00:00:00.000Z",
    limit: 1,
  },
  firstPage: {
    items: [
      {
        evidenceId: "00000000-0000-4000-8000-000000000011",
        activityId: "00000000-0000-4000-8000-000000000010",
        activityCategory: "run",
        metric: "speed",
        unit: "meters_per_second",
        method: "run_speed_30m",
        value: 4.25,
        observedAt: "2026-08-09T08:00:00.000Z",
        confidence: 0.9,
        calculationVersion: "threshold-v1",
        policyVersion: "threshold-policy-v1",
      },
    ],
    hasMore: true,
  },
  continuationRequest: {
    profileId: PROFILE_ID,
    fromObservedAt: "2026-08-01T00:00:00.000Z",
    limit: 1,
    after: {
      observedAt: "2026-08-09T08:00:00.000Z",
      evidenceId: "00000000-0000-4000-8000-000000000011",
    },
  },
  continuationPage: {
    items: [
      {
        evidenceId: "00000000-0000-4000-8000-000000000013",
        activityId: "00000000-0000-4000-8000-000000000012",
        activityCategory: "run",
        metric: "speed",
        unit: "meters_per_second",
        method: "run_speed_30m",
        value: 4.3,
        observedAt: NOW,
        confidence: 0.85,
        calculationVersion: "threshold-v1",
        policyVersion: "threshold-policy-v1",
      },
    ],
    hasMore: false,
  },
} satisfies CursorContinuationFixture<
  ThresholdEvidenceRequestFixture,
  ThresholdEvidencePageFixture
>;
export const THRESHOLD_EVIDENCE_PAGE_V1_FIXTURE =
  THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.firstPage;
export const ATHLETE_RECALCULATION_REPAIR_RECEIPT_V1_FIXTURE = {
  status: "accepted",
  profileId: PROFILE_ID,
  cache_tags: [
    "athleteIntelligence.getThresholdEvidence",
    "athleteIntelligence.getTrainingEffects",
    "home.getDashboard",
  ],
} satisfies z.input<typeof athleteRecalculationRepairReceiptSchema>;
const ingestionBase = {
  ingestionId: "00000000-0000-4000-8000-000000000020",
  profileId: PROFILE_ID,
  operationId: "ingestion-operation-0000000000000001",
  activityId: null,
  artifactId: null,
  requestedAt: NOW,
  updatedAt: NOW,
};
/** The complete public direct-ingestion status state machine. */
export const ACTIVITY_INGESTION_STATUS_V1_FIXTURES = [
  {
    ...ingestionBase,
    source: "mobile_recording",
    status: "awaiting_upload",
    startedAt: null,
    actions: { retry: false },
  },
  {
    ...ingestionBase,
    source: "manual_import",
    status: "processing",
    startedAt: NOW,
    actions: { retry: false },
  },
  {
    ...ingestionBase,
    source: "provider_sync",
    status: "failed_retryable",
    failureCode: "dependency_unavailable",
    failedAt: NOW,
    actions: { retry: true },
  },
  {
    ...ingestionBase,
    source: "mobile_recording",
    status: "succeeded",
    activityId: "00000000-0000-4000-8000-000000000021",
    artifactId: "00000000-0000-4000-8000-000000000022",
    completedAt: NOW,
    actions: { retry: false },
  },
  {
    ...ingestionBase,
    source: "manual_import",
    status: "failed_terminal",
    failureCode: "invalid_activity",
    failedAt: NOW,
    actions: { retry: false },
  },
] satisfies z.input<typeof activityIngestionSafeStatusDtoSchema>[];
const prescriptionStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000033",
      name: "Work",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
  ],
});
const prescription: PlannedSessionFixture["prescription"] = {
  resolutionManifest: createResolutionManifestFixture({
    activityPlanId: "00000000-0000-4000-8000-000000000030",
    activityPlanRevision: 7,
    structure: prescriptionStructure,
    demand: {
      activity_category: "run",
      training_intent: "general_maintenance",
      target_duration_minutes: 30,
      target_common_load: null,
      importance: "normal",
    },
  }),
  capturedAt: NOW,
};
function plannedSessionFixture(input: {
  sequence: number;
  source: PlannedSessionFixture["source"];
  lifecycle: PlannedSessionFixture["lifecycle"];
}): PlannedSessionFixture {
  return {
    id: `00000000-0000-4000-8000-${input.sequence.toString().padStart(12, "0")}`,
    profileId: PROFILE_ID,
    sessionRevision: 2,
    planningDate: "2026-08-10",
    originalTargetDate: "2026-08-10",
    source: input.source,
    groupEventId: null,
    activityPlanId: "00000000-0000-4000-8000-000000000030",
    prescription,
    lifecycle: input.lifecycle,
  };
}
/** Source, cancellation reason, lifecycle, and completion variants for planned sessions. */
export const PLANNED_SESSION_V1_FIXTURES = tuple([
  plannedSessionFixture({
    sequence: 40,
    source: { kind: "direct", operationId: "planned-operation-00000000000000001" },
    lifecycle: { status: "scheduled" },
  }),
  plannedSessionFixture({
    sequence: 41,
    source: {
      kind: "training_plan",
      trainingPlanId: "00000000-0000-4000-8000-000000000050",
      trainingPlanRevision: 3,
      sourceSessionId: "00000000-0000-4000-8000-000000000051",
      applicationId: null,
    },
    lifecycle: { status: "cancelled", reason: "user_requested", cancelledAt: NOW },
  }),
  plannedSessionFixture({
    sequence: 43,
    source: { kind: "direct", operationId: "planned-operation-00000000000000002" },
    lifecycle: { status: "cancelled", reason: "series_cancelled", cancelledAt: NOW },
  }),
  plannedSessionFixture({
    sequence: 44,
    source: { kind: "direct", operationId: "planned-operation-00000000000000003" },
    lifecycle: {
      status: "completed",
      completion: {
        state: "linked",
        activityId: "00000000-0000-4000-8000-000000000052",
        linkedAt: NOW,
        outcome: "full",
      },
    },
  }),
  plannedSessionFixture({
    sequence: 45,
    source: { kind: "direct", operationId: "planned-operation-00000000000000004" },
    lifecycle: {
      status: "completed",
      completion: {
        state: "activity_deleted",
        linkedAt: "2026-08-09T08:00:00.000Z",
        unlinkedAt: NOW,
        outcome: "full",
      },
    },
  }),
]) satisfies readonly PlannedSessionFixture[];
export const PLANNED_SESSION_RANGE_V1_FIXTURE = {
  items: [...PLANNED_SESSION_V1_FIXTURES],
  truncated: false,
} satisfies z.input<typeof plannedSessionRangeDtoSchema>;
export const PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE = {
  items: Array.from({ length: 5000 }, (_, index) =>
    plannedSessionFixture({
      sequence: 1000 + index,
      source: {
        kind: "direct",
        operationId: `planned-truncated-operation-${index.toString().padStart(6, "0")}`,
      },
      lifecycle: { status: "scheduled" },
    }),
  ),
  truncated: true,
} satisfies z.input<typeof plannedSessionRangeDtoSchema>;
export const PLANNED_SESSION_RANGE_V1_FIXTURES = tuple([
  PLANNED_SESSION_RANGE_V1_FIXTURE,
  PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE,
]);
export const PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES = tuple([
  {
    outcome: "created",
    session: PLANNED_SESSION_V1_FIXTURES[0],
    cache_tags: [
      "plannedSessions.range",
      "calendar.range",
      "calendar.day",
      "trainingPlans.getPlanningLedger",
      "trainingPlans.getPlanTabProjection",
      "trainingPlans.get",
      "trainingPlans.list",
      "activityPlans.getById",
      "activities.getById",
      "activities.listPaginated",
      "home.getDashboard",
    ],
  },
  {
    outcome: "unchanged",
    session: PLANNED_SESSION_V1_FIXTURES[0],
    cache_tags: [
      "plannedSessions.range",
      "calendar.range",
      "calendar.day",
      "trainingPlans.getPlanningLedger",
      "trainingPlans.getPlanTabProjection",
      "trainingPlans.get",
      "trainingPlans.list",
      "activityPlans.getById",
      "activities.getById",
      "activities.listPaginated",
      "home.getDashboard",
    ],
  },
  {
    outcome: "updated",
    session: PLANNED_SESSION_V1_FIXTURES[1],
    cache_tags: [
      "plannedSessions.range",
      "calendar.range",
      "calendar.day",
      "trainingPlans.getPlanningLedger",
      "trainingPlans.getPlanTabProjection",
      "trainingPlans.get",
      "trainingPlans.list",
      "activityPlans.getById",
      "activities.getById",
      "activities.listPaginated",
      "home.getDashboard",
    ],
  },
]) satisfies readonly z.input<typeof plannedSessionMutationReceiptSchema>[];
/** Procedure-to-response fixtures used by clients during the v1 migration. */
export const API_CLIENT_CONTRACT_V1_RESPONSE_FIXTURES = {
  "athleteIntelligence.getTrainingEffects": [
    TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.firstPage,
    TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.continuationPage,
  ],
  "athleteIntelligence.getThresholdEvidence": [
    THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.firstPage,
    THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.continuationPage,
  ],
  "athleteIntelligence.requestRecalculationRepair": [
    ATHLETE_RECALCULATION_REPAIR_RECEIPT_V1_FIXTURE,
  ],
  "activityFiles.getIngestionStatus": ACTIVITY_INGESTION_STATUS_V1_FIXTURES,
  "plannedSessions.range": PLANNED_SESSION_RANGE_V1_FIXTURES,
  "plannedSessions.create": PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES,
  "plannedSessions.move": [PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[2]],
  "plannedSessions.changePlanOnly": [PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[2]],
  "plannedSessions.cancel": [PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[2]],
  "plannedSessions.linkCompletion": [PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[2]],
  "plannedSessions.linkGroupEvent": [PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[2]],
  "plannedSessions.unlinkGroupEvent": [PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[2]],
} as const;
