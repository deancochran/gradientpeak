import { describe, expect, it } from "vitest";
import {
  activityFileIngestionOperationSchema,
  activityFileIngestionSourceSchema,
  activityFileIngestionStatusSchema,
  activityFileIngestionStatusTransitionMatrix,
  canTransitionActivityFileIngestionStatus,
} from "../ingestion";

const instant = "2026-08-10T08:00:00.000Z";
const operation = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  contractVersion: "activity-intake-v1",
  operationId: "opaque_operation_identity_1234567890",
  source: "manual_import",
  provider: null,
  externalId: null,
  integrationId: null,
  activityId: null,
  artifactId: null,
  stagingBucket: null,
  stagingPath: null,
  expectedSha256: null,
  expectedByteSize: null,
  expectedFormat: null,
  expectedMediaType: null,
  uploadedAt: null,
  stagingCleanupPending: false,
  stagingCleanedAt: null,
  stagingCleanupError: null,
  status: "awaiting_upload",
  failureCode: null,
  requestedAt: instant,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  receivedAt: instant,
  createdAt: instant,
  updatedAt: instant,
} as const;

describe("activity file ingestion operation contracts", () => {
  it("uses only the new business-operation lifecycle and preserves source kinds", () => {
    expect(activityFileIngestionStatusSchema.options).toEqual([
      "awaiting_upload",
      "processing",
      "failed_retryable",
      "succeeded",
      "failed_terminal",
    ]);
    expect(activityFileIngestionSourceSchema.options).toEqual([
      "mobile_recording",
      "manual_import",
      "provider_sync",
    ]);
    expect(activityFileIngestionOperationSchema.parse(operation)).toEqual(operation);
  });

  it("enforces opaque operation IDs and source-specific provider identity", () => {
    expect(
      activityFileIngestionOperationSchema.safeParse({ ...operation, operationId: "plain-id" })
        .success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        source: "provider_sync",
        provider: "wahoo",
        externalId: "provider-activity-1",
        integrationId: "33333333-3333-4333-8333-333333333333",
      }).success,
    ).toBe(true);
    expect(
      activityFileIngestionOperationSchema.safeParse({ ...operation, provider: "wahoo" }).success,
    ).toBe(false);
  });

  it("requires complete, valid staging metadata and valid cleanup state", () => {
    const staged = {
      ...operation,
      stagingBucket: "private",
      stagingPath: "uploads/activity.fit",
      expectedSha256: "a".repeat(64),
      expectedByteSize: 123,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
    } as const;
    expect(activityFileIngestionOperationSchema.safeParse(staged).success).toBe(true);
    expect(
      activityFileIngestionOperationSchema.safeParse({ ...staged, expectedByteSize: 0 }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...staged,
        expectedMediaType: "application/gpx+xml",
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({ ...staged, stagingPath: null }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...staged,
        stagingCleanupPending: true,
      }).success,
    ).toBe(false);
  });

  it("requires status-specific activity, artifact, start, completion, and failure fields", () => {
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "succeeded",
        activityId: "44444444-4444-4444-8444-444444444444",
        artifactId: "55555555-5555-4555-8555-555555555555",
        startedAt: instant,
        completedAt: instant,
      }).success,
    ).toBe(true);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "succeeded",
        startedAt: instant,
        completedAt: instant,
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "failed_retryable",
        startedAt: instant,
        failureCode: "hash_mismatch",
        failedAt: instant,
      }).success,
    ).toBe(true);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "failed_terminal",
        startedAt: instant,
        failureCode: null,
        failedAt: instant,
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "failed_retryable",
        failureCode: "lease_lost",
        failedAt: instant,
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "failed_retryable",
        failureCode: "hash_mismatch",
        failedAt: instant,
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        status: "processing",
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        artifactId: "55555555-5555-4555-8555-555555555555",
      }).success,
    ).toBe(false);
    expect(
      activityFileIngestionOperationSchema.safeParse({
        ...operation,
        cancellationReason: "user_requested",
      }).success,
    ).toBe(false);
  });

  it("exposes a lifecycle matrix and rejects invalid operation transitions", () => {
    expect(activityFileIngestionStatusTransitionMatrix).toEqual({
      awaiting_upload: ["awaiting_upload", "processing"],
      processing: ["processing", "failed_retryable", "succeeded", "failed_terminal"],
      failed_retryable: ["failed_retryable", "awaiting_upload", "processing"],
      succeeded: ["succeeded"],
      failed_terminal: ["failed_terminal"],
    });
    expect(canTransitionActivityFileIngestionStatus("awaiting_upload", "processing")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("processing", "succeeded")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("failed_retryable", "awaiting_upload")).toBe(
      true,
    );
    expect(canTransitionActivityFileIngestionStatus("failed_retryable", "processing")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("awaiting_upload", "succeeded")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("succeeded", "processing")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("failed_terminal", "awaiting_upload")).toBe(
      false,
    );
  });
});
