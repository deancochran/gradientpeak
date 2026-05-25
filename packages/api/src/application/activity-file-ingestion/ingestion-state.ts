import {
  type ActivityFileIngestionSource,
  type ActivityFileIngestionStatus,
  canTransitionActivityFileIngestionStatus,
} from "@repo/core";
import {
  type ActivityFileIngestionInsert,
  type ActivityFileIngestionRow,
  activityFileIngestions,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type DbClient = Pick<ReturnType<typeof getRequiredDb>, "insert" | "select" | "update">;
export interface CreateActivityFileIngestionInput {
  activityId: string;
  profileId: string;
  source: ActivityFileIngestionSource;
  provider?: ActivityFileIngestionInsert["provider"] | null;
  externalId?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  now?: Date;
}

export interface TransitionActivityFileIngestionInput {
  id: string;
  profileId: string;
  status: ActivityFileIngestionStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  now?: Date;
}

function scopedIngestionWhere(input: { id: string; profileId: string }) {
  return and(
    eq(activityFileIngestions.id, input.id),
    eq(activityFileIngestions.profile_id, input.profileId),
  );
}

async function loadActivityFileIngestion(
  db: DbClient,
  input: { id: string; profileId: string },
): Promise<ActivityFileIngestionRow> {
  const [row] = await db
    .select()
    .from(activityFileIngestions)
    .where(scopedIngestionWhere(input))
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity file ingestion not found",
    });
  }

  return row;
}

export async function createActivityFileIngestion(
  db: DbClient,
  input: CreateActivityFileIngestionInput,
): Promise<ActivityFileIngestionRow> {
  const now = input.now ?? new Date();
  const [created] = await db
    .insert(activityFileIngestions)
    .values({
      activity_id: input.activityId,
      profile_id: input.profileId,
      source: input.source,
      provider: input.provider ?? null,
      external_id: input.externalId ?? null,
      file_path: input.filePath ?? null,
      file_size: input.fileSize ?? null,
      file_type: input.fileType ?? null,
      status: "pending_upload",
      attempt_count: 0,
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .returning();

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create activity file ingestion",
    });
  }

  return created;
}

function buildTransitionUpdate(
  row: ActivityFileIngestionRow,
  input: TransitionActivityFileIngestionInput,
): Partial<ActivityFileIngestionInsert> {
  const now = input.now ?? new Date();
  const base = {
    status: input.status,
    updated_at: now,
  } satisfies Partial<ActivityFileIngestionInsert>;

  switch (input.status) {
    case "uploaded":
      return {
        ...base,
        last_error_code: null,
        last_error_message: null,
        failed_at: null,
      };
    case "processing":
      return {
        ...base,
        attempt_count: row.attempt_count + 1,
        started_at: now,
        last_error_code: null,
        last_error_message: null,
        failed_at: null,
      };
    case "ready":
      return {
        ...base,
        completed_at: now,
        last_error_code: null,
        last_error_message: null,
      };
    case "failed":
      return {
        ...base,
        failed_at: now,
        last_error_code: input.errorCode ?? "unknown_error",
        last_error_message: input.errorMessage ?? "Activity file ingestion failed",
      };
    case "pending_upload":
      return {
        ...base,
        last_error_code: null,
        last_error_message: null,
        failed_at: null,
      };
  }
}

export async function transitionActivityFileIngestion(
  db: DbClient,
  input: TransitionActivityFileIngestionInput,
): Promise<ActivityFileIngestionRow> {
  const existing = await loadActivityFileIngestion(db, input);

  if (!canTransitionActivityFileIngestionStatus(existing.status, input.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot transition activity file ingestion from ${existing.status} to ${input.status}`,
    });
  }

  const [updated] = await db
    .update(activityFileIngestions)
    .set(buildTransitionUpdate(existing, input))
    .where(scopedIngestionWhere(input))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity file ingestion not found",
    });
  }

  return updated;
}

export function markUploaded(
  db: DbClient,
  input: Omit<TransitionActivityFileIngestionInput, "status">,
) {
  return transitionActivityFileIngestion(db, { ...input, status: "uploaded" });
}

export function markProcessing(
  db: DbClient,
  input: Omit<TransitionActivityFileIngestionInput, "status">,
) {
  return transitionActivityFileIngestion(db, { ...input, status: "processing" });
}

export function markReady(
  db: DbClient,
  input: Omit<TransitionActivityFileIngestionInput, "status">,
) {
  return transitionActivityFileIngestion(db, { ...input, status: "ready" });
}

export function markFailed(
  db: DbClient,
  input: Omit<TransitionActivityFileIngestionInput, "status">,
) {
  return transitionActivityFileIngestion(db, { ...input, status: "failed" });
}
