import {
  ACTIVITY_INGESTION_STATUS_V1_FIXTURES,
  API_CLIENT_CONTRACT_V1_RESPONSE_FIXTURES,
  ATHLETE_RECALCULATION_REPAIR_RECEIPT_V1_FIXTURE,
  PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES,
  PLANNED_SESSION_RANGE_V1_FIXTURE,
  PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE,
  PLANNED_SESSION_V1_FIXTURES,
  THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE,
  THRESHOLD_EVIDENCE_PAGE_V1_FIXTURE,
  TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE,
  TRAINING_EFFECTS_PAGE_V1_FIXTURE,
} from "@repo/api/test-support/client-contract-v1";
import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import { activityIngestionSafeStatusDtoSchema } from "./activity-ingestion";
import { athleteRecalculationRepairReceiptSchema } from "./athlete-load-range";
import {
  plannedSessionDtoSchema,
  plannedSessionMutationReceiptSchema,
  plannedSessionRangeDtoSchema,
} from "./planned-sessions";
import {
  thresholdEvidencePageDtoSchema,
  thresholdEvidenceRequestSchema,
} from "./threshold-evidence";
import { trainingEffectsPageDtoSchema, trainingEffectsRequestSchema } from "./training-effects";

const RESPONSE_SCHEMA_BY_PROCEDURE = {
  "athleteIntelligence.getTrainingEffects": trainingEffectsPageDtoSchema,
  "athleteIntelligence.getThresholdEvidence": thresholdEvidencePageDtoSchema,
  "athleteIntelligence.requestRecalculationRepair": athleteRecalculationRepairReceiptSchema,
  "activityFiles.getIngestionStatus": activityIngestionSafeStatusDtoSchema,
  "plannedSessions.range": plannedSessionRangeDtoSchema,
  "plannedSessions.create": plannedSessionMutationReceiptSchema,
  "plannedSessions.move": plannedSessionMutationReceiptSchema,
  "plannedSessions.cancel": plannedSessionMutationReceiptSchema,
  "plannedSessions.linkCompletion": plannedSessionMutationReceiptSchema,
  "plannedSessions.linkGroupEvent": plannedSessionMutationReceiptSchema,
  "plannedSessions.unlinkGroupEvent": plannedSessionMutationReceiptSchema,
} as const;

describe("API client contract v1 fixtures", () => {
  it("parses every response fixture through its public DTO", () => {
    expect(trainingEffectsPageDtoSchema.parse(TRAINING_EFFECTS_PAGE_V1_FIXTURE)).toEqual(
      TRAINING_EFFECTS_PAGE_V1_FIXTURE,
    );
    expect(thresholdEvidencePageDtoSchema.parse(THRESHOLD_EVIDENCE_PAGE_V1_FIXTURE)).toEqual(
      THRESHOLD_EVIDENCE_PAGE_V1_FIXTURE,
    );
    expect(
      athleteRecalculationRepairReceiptSchema.parse(
        ATHLETE_RECALCULATION_REPAIR_RECEIPT_V1_FIXTURE,
      ),
    ).toEqual(ATHLETE_RECALCULATION_REPAIR_RECEIPT_V1_FIXTURE);
    for (const fixture of ACTIVITY_INGESTION_STATUS_V1_FIXTURES) {
      expect(activityIngestionSafeStatusDtoSchema.parse(fixture)).toEqual(fixture);
    }
    for (const fixture of PLANNED_SESSION_V1_FIXTURES) {
      expect(plannedSessionDtoSchema.parse(fixture)).toEqual(fixture);
    }
    expect(plannedSessionRangeDtoSchema.parse(PLANNED_SESSION_RANGE_V1_FIXTURE)).toEqual(
      PLANNED_SESSION_RANGE_V1_FIXTURE,
    );
    for (const fixture of PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES) {
      expect(plannedSessionMutationReceiptSchema.parse(fixture)).toEqual(fixture);
    }
  });

  it("exports fixtures from the supported test-only package subpath", () => {
    expect(API_CLIENT_CONTRACT_V1_RESPONSE_FIXTURES["plannedSessions.range"]).toContain(
      PLANNED_SESSION_RANGE_V1_FIXTURE,
    );
  });

  it("keeps procedure-map names aligned with real procedures and matching response DTOs", () => {
    const mappedNames = Object.keys(API_CLIENT_CONTRACT_V1_RESPONSE_FIXTURES);
    expect(mappedNames).toEqual(Object.keys(RESPONSE_SCHEMA_BY_PROCEDURE));

    const actualProcedureNames = new Set(Object.keys(appRouter._def.procedures));
    for (const procedureName of mappedNames as Array<keyof typeof RESPONSE_SCHEMA_BY_PROCEDURE>) {
      expect(actualProcedureNames.has(procedureName), procedureName).toBe(true);
      const schema = RESPONSE_SCHEMA_BY_PROCEDURE[procedureName];
      for (const fixture of API_CLIENT_CONTRACT_V1_RESPONSE_FIXTURES[procedureName]) {
        expect(schema.safeParse(fixture).success, procedureName).toBe(true);
      }
    }
  });

  it("provides canonical cursor continuations from each first page's final item", () => {
    const trainingEffect = TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.firstPage.items.at(-1);
    expect(TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.firstPage.hasMore).toBe(true);
    expect(TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.continuationRequest.after).toEqual({
      effectiveAt: trainingEffect?.effectiveAt,
      activityId: trainingEffect?.activityId,
      activityAnalysisRevision: trainingEffect?.activityAnalysisRevision,
    });
    expect(
      trainingEffectsRequestSchema.safeParse(
        TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.continuationRequest,
      ).success,
    ).toBe(true);
    expect(
      trainingEffectsPageDtoSchema.safeParse(
        TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.continuationPage,
      ).success,
    ).toBe(true);

    const threshold = THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.firstPage.items.at(-1);
    expect(THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.firstPage.hasMore).toBe(true);
    expect(THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.continuationRequest.after).toEqual({
      observedAt: threshold?.observedAt,
      evidenceId: threshold?.evidenceId,
    });
    expect(
      thresholdEvidenceRequestSchema.safeParse(
        THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.continuationRequest,
      ).success,
    ).toBe(true);
    expect(
      thresholdEvidencePageDtoSchema.safeParse(
        THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE.continuationPage,
      ).success,
    ).toBe(true);
  });

  it("includes both complete and truncated planned-session ranges", () => {
    expect(PLANNED_SESSION_RANGE_V1_FIXTURE.truncated).toBe(false);
    expect(PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE.truncated).toBe(true);
    expect(PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE.items).toHaveLength(5_000);
    expect(plannedSessionRangeDtoSchema.parse(PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE)).toEqual(
      PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE,
    );
  });

  it("covers every public ingestion state and exposes retry only for retryable failure", () => {
    expect(new Set(ACTIVITY_INGESTION_STATUS_V1_FIXTURES.map(({ status }) => status))).toEqual(
      new Set([
        "awaiting_upload",
        "processing",
        "failed_retryable",
        "succeeded",
        "failed_terminal",
      ]),
    );
    expect(
      ACTIVITY_INGESTION_STATUS_V1_FIXTURES.filter(({ actions }) => actions.retry).map(
        ({ status }) => status,
      ),
    ).toEqual(["failed_retryable"]);
  });

  it("covers every public planned-session source, lifecycle, cancellation, completion, and receipt outcome", () => {
    expect(new Set(PLANNED_SESSION_V1_FIXTURES.map(({ source }) => source.kind))).toEqual(
      new Set(["direct", "training_plan", "recurrence"]),
    );
    expect(new Set(PLANNED_SESSION_V1_FIXTURES.map(({ lifecycle }) => lifecycle.status))).toEqual(
      new Set(["scheduled", "cancelled", "completed"]),
    );
    expect(
      new Set(
        PLANNED_SESSION_V1_FIXTURES.flatMap(({ lifecycle }) =>
          lifecycle.status === "cancelled" ? [lifecycle.reason] : [],
        ),
      ),
    ).toEqual(new Set(["user_requested", "plan_replaced", "series_cancelled"]));
    expect(
      new Set(
        PLANNED_SESSION_V1_FIXTURES.flatMap(({ lifecycle }) =>
          lifecycle.status === "completed" ? [lifecycle.completion.state] : [],
        ),
      ),
    ).toEqual(new Set(["linked", "activity_deleted"]));
    expect(
      new Set(PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES.map(({ outcome }) => outcome)),
    ).toEqual(new Set(["created", "unchanged", "updated"]));
  });

  it("rejects worker, storage, provider, and persistence-only fields", () => {
    expect(
      trainingEffectsPageDtoSchema.safeParse({
        ...TRAINING_EFFECTS_PAGE_V1_FIXTURE,
        items: [{ ...TRAINING_EFFECTS_PAGE_V1_FIXTURE.items[0], inputFingerprint: "private" }],
      }).success,
    ).toBe(false);
    expect(
      thresholdEvidencePageDtoSchema.safeParse({
        ...THRESHOLD_EVIDENCE_PAGE_V1_FIXTURE,
        items: [
          { ...THRESHOLD_EVIDENCE_PAGE_V1_FIXTURE.items[0], providerPayload: { private: true } },
        ],
      }).success,
    ).toBe(false);
    for (const privateField of [
      "claimToken",
      "stagingBucket",
      "stagingPath",
      "provider",
      "externalId",
      "integrationId",
      "rawError",
    ]) {
      expect(
        activityIngestionSafeStatusDtoSchema.safeParse({
          ...ACTIVITY_INGESTION_STATUS_V1_FIXTURES[1],
          [privateField]: "private",
        }).success,
      ).toBe(false);
    }
    expect(
      plannedSessionDtoSchema.safeParse({
        ...PLANNED_SESSION_V1_FIXTURES[0],
        idempotencyKey: "persistence-private",
      }).success,
    ).toBe(false);
    expect(
      plannedSessionRangeDtoSchema.safeParse({
        ...PLANNED_SESSION_RANGE_V1_FIXTURE,
        storageCursor: "private",
      }).success,
    ).toBe(false);
    expect(
      plannedSessionMutationReceiptSchema.safeParse({
        ...PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES[0],
        workerJobId: "private",
      }).success,
    ).toBe(false);
    expect(
      athleteRecalculationRepairReceiptSchema.safeParse({
        ...ATHLETE_RECALCULATION_REPAIR_RECEIPT_V1_FIXTURE,
        queueId: "worker-private",
      }).success,
    ).toBe(false);
  });
});
