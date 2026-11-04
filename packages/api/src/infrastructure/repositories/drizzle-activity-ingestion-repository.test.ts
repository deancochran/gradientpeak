import type { ActivityFileIngestionRow } from "@repo/db";
import { describe, expect, it } from "vitest";
import {
  mapActivityIngestionRow,
  projectSafeActivityIngestionStatus,
} from "./drizzle-activity-ingestion-repository";

const now = new Date("2026-08-01T12:00:00.000Z");
const operationRow = {
  id: "11111111-1111-4111-8111-111111111111",
  activity_id: null,
  artifact_id: null,
  profile_id: "22222222-2222-4222-8222-222222222222",
  source: "manual_import",
  provider: null,
  external_id: null,
  integration_id: null,
  contract_version: "activity-intake-v1",
  operation_id: "manual_import_operation_1234567890",
  staging_bucket: "private-artifacts",
  staging_path: "profiles/owner/upload.fit",
  expected_sha256: "a".repeat(64),
  expected_byte_size: 128,
  expected_format: "fit",
  expected_media_type: "application/vnd.ant.fit",
  uploaded_at: now,
  staging_cleanup_pending: false,
  staging_cleaned_at: null,
  staging_cleanup_error: null,
  received_at: now,
  status: "awaiting_upload",
  failure_code: null,
  requested_at: now,
  started_at: null,
  completed_at: null,
  failed_at: null,
  created_at: now,
  updated_at: now,
} satisfies ActivityFileIngestionRow;

describe("activity-ingestion Drizzle mappers", () => {
  it("maps operation rows through the corrected Core contract", () => {
    expect(mapActivityIngestionRow(operationRow)).toMatchObject({
      id: operationRow.id,
      operationId: operationRow.operation_id,
      status: "awaiting_upload",
      uploadedAt: now.toISOString(),
    });
  });

  it("projects a safe status without worker or private staging fields", () => {
    const safe = projectSafeActivityIngestionStatus(mapActivityIngestionRow(operationRow));
    expect(safe).toMatchObject({
      id: operationRow.id,
      profileId: operationRow.profile_id,
      status: "awaiting_upload",
    });
    expect(safe).not.toHaveProperty("stagingPath");
    expect(safe).not.toHaveProperty("stagingBucket");
    expect(safe).not.toHaveProperty("stagingCleanupError");
    expect(safe).not.toHaveProperty("claimToken");
    expect(safe).not.toHaveProperty("provider");
  });

  it("rejects provider identity on a non-provider operation", () => {
    expect(() => mapActivityIngestionRow({ ...operationRow, provider: "wahoo" })).toThrow();
  });
});
