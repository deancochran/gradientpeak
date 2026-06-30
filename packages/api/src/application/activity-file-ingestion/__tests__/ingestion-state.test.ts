import type { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivityFileIngestion,
  markFailed,
  markProcessing,
  markReady,
  markUploaded,
  transitionActivityFileIngestion,
} from "../ingestion-state";

type IngestionRow = {
  id: string;
  activity_id: string;
  profile_id: string;
  source: "mobile_recording" | "manual_import" | "provider_sync";
  provider: string | null;
  external_id: string | null;
  file_path: string | null;
  file_size: number | null;
  file_type: string | null;
  status: "pending_upload" | "uploaded" | "processing" | "ready" | "failed";
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  requested_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function collectStringValues(value: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  return Object.values(value).flatMap((entry) => collectStringValues(entry, seen));
}

function matchesScope(row: IngestionRow, where: unknown): boolean {
  const directScope = where as { id?: string; profileId?: string };
  if (directScope.id || directScope.profileId) {
    return row.id === directScope.id && row.profile_id === directScope.profileId;
  }

  const stringValues = collectStringValues(where);
  return stringValues.includes(row.id) && stringValues.includes(row.profile_id);
}

function createFakeDb(initialRows: IngestionRow[] = []) {
  const rows = [...initialRows];
  const calls = {
    insertValues: [] as unknown[],
    updateSets: [] as Record<string, unknown>[],
    selectWhere: [] as unknown[],
    updateWhere: [] as unknown[],
  };

  let pendingWhere: unknown;

  return {
    rows,
    calls,
    db: {
      insert: vi.fn(() => ({
        values: vi.fn((values: Partial<IngestionRow>) => {
          calls.insertValues.push(values);
          return {
            returning: vi.fn(async () => {
              const now = new Date("2026-01-01T00:00:00.000Z");
              const row: IngestionRow = {
                id: `ingestion-${rows.length + 1}`,
                activity_id: values.activity_id ?? "activity-1",
                profile_id: values.profile_id ?? "profile-1",
                source: values.source ?? "manual_import",
                provider: values.provider ?? null,
                external_id: values.external_id ?? null,
                file_path: values.file_path ?? null,
                file_size: values.file_size ?? null,
                file_type: values.file_type ?? null,
                status: values.status ?? "pending_upload",
                attempt_count: values.attempt_count ?? 0,
                last_error_code: values.last_error_code ?? null,
                last_error_message: values.last_error_message ?? null,
                requested_at: values.requested_at ?? now,
                started_at: values.started_at ?? null,
                completed_at: values.completed_at ?? null,
                failed_at: values.failed_at ?? null,
                created_at: values.created_at ?? now,
                updated_at: values.updated_at ?? now,
              };
              rows.push(row);
              return [row];
            }),
          };
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((where: unknown) => {
            calls.selectWhere.push(where);
            pendingWhere = where;
            return {
              limit: vi.fn(async () => {
                return rows.filter((row) => matchesScope(row, pendingWhere));
              }),
            };
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((set: Record<string, unknown>) => {
          calls.updateSets.push(set);
          return {
            where: vi.fn((where: unknown) => {
              calls.updateWhere.push(where);
              return {
                returning: vi.fn(async () => {
                  const row = rows.find((candidate) => matchesScope(candidate, where));

                  if (!row) {
                    return [];
                  }

                  Object.assign(row, set);
                  return [row];
                }),
              };
            }),
          };
        }),
      })),
    },
  };
}

function row(overrides: Partial<IngestionRow> = {}): IngestionRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "ingestion-1",
    activity_id: "activity-1",
    profile_id: "profile-1",
    source: "manual_import",
    provider: null,
    external_id: null,
    file_path: null,
    file_size: null,
    file_type: null,
    status: "pending_upload",
    attempt_count: 0,
    last_error_code: null,
    last_error_message: null,
    requested_at: now,
    started_at: null,
    completed_at: null,
    failed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("activity file ingestion state service", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("creates a pending_upload ingestion with source/provider/external/file metadata", async () => {
    const fake = createFakeDb();

    const created = await createActivityFileIngestion(fake.db as any, {
      activityId: "activity-1",
      profileId: "profile-1",
      source: "provider_sync",
      provider: "wahoo",
      externalId: "external-1",
      filePath: "activity-files/profile-1/external-1.fit",
      fileSize: 12345,
      fileType: "fit",
    });

    expect(created.status).toBe("pending_upload");
    expect(created.attempt_count).toBe(0);
    expect(created.provider).toBe("wahoo");
    expect(created.external_id).toBe("external-1");
    expect(fake.calls.insertValues[0]).toMatchObject({
      activity_id: "activity-1",
      profile_id: "profile-1",
      source: "provider_sync",
      status: "pending_upload",
      attempt_count: 0,
    });
  });

  it("applies valid transition timestamp semantics and convenience wrappers", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z");
    const fake = createFakeDb([
      row({
        status: "pending_upload",
        last_error_code: "old_error",
        last_error_message: "old failure",
        failed_at: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ]);

    const uploaded = await markUploaded(fake.db as any, {
      id: "ingestion-1",
      profileId: "profile-1",
      now,
    });

    expect(uploaded).toMatchObject({
      status: "uploaded",
      last_error_code: null,
      last_error_message: null,
      failed_at: null,
      updated_at: now,
    });

    const processing = await markProcessing(fake.db as any, {
      id: "ingestion-1",
      profileId: "profile-1",
      now,
    });

    expect(processing.status).toBe("processing");
    expect(processing.started_at).toBe(now);
    expect(processing.attempt_count).toBe(1);
    expect(processing.last_error_code).toBeNull();
    expect(processing.last_error_message).toBeNull();

    const ready = await markReady(fake.db as any, {
      id: "ingestion-1",
      profileId: "profile-1",
      now,
    });

    expect(ready.status).toBe("ready");
    expect(ready.completed_at).toBe(now);
    expect(ready.last_error_code).toBeNull();
    expect(ready.last_error_message).toBeNull();
  });

  it("marks failed with error details and preserves attempt count", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z");
    const fake = createFakeDb([row({ status: "processing", attempt_count: 2 })]);

    const failed = await markFailed(fake.db as any, {
      id: "ingestion-1",
      profileId: "profile-1",
      errorCode: "parse_error",
      errorMessage: "Could not parse FIT file",
      now,
    });

    expect(failed).toMatchObject({
      status: "failed",
      attempt_count: 2,
      failed_at: now,
      last_error_code: "parse_error",
      last_error_message: "Could not parse FIT file",
      updated_at: now,
    });
  });

  it("throws BAD_REQUEST and does not update invalid transitions", async () => {
    const fake = createFakeDb([row({ status: "pending_upload" })]);

    await expect(
      transitionActivityFileIngestion(fake.db as any, {
        id: "ingestion-1",
        profileId: "profile-1",
        status: "processing",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" satisfies TRPCError["code"] });

    expect(fake.calls.updateSets).toHaveLength(0);
  });

  it("throws NOT_FOUND when the ingestion id is missing", async () => {
    const fake = createFakeDb();

    await expect(
      markUploaded(fake.db as any, { id: "missing", profileId: "profile-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" satisfies TRPCError["code"] });
  });

  it("scopes loads and updates by profile id", async () => {
    const fake = createFakeDb([row({ id: "ingestion-1", profile_id: "profile-2" })]);

    await expect(
      markUploaded(fake.db as any, { id: "ingestion-1", profileId: "profile-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" satisfies TRPCError["code"] });

    expect(fake.rows[0]?.status).toBe("pending_upload");
  });
});
