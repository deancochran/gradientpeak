import type { ActivityFileType } from "@repo/core/server/activity-files";
import {
  type ActivityFileIngestionRow,
  type ActivityRow,
  activities,
  activityFileIngestions,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { markFailed, markProcessing, markReady, markUploaded } from "./ingestion-state";

type DbClient = ReturnType<typeof getRequiredDb>;

interface LoggerLike {
  error(message: string, metadata?: unknown): void;
}

interface ParseStoredActivityFileResult<TParsedData> {
  activityFile: { size?: number | null };
  parsedData: TParsedData;
}

export interface ProcessUploadedActivityFileInput {
  userId: string;
  ingestionId: string;
  activityId: string;
  activityFilePath: string;
  fileSize?: number | null;
  fileType: ActivityFileType;
}

export interface ProcessUploadedActivityFileDependencies<TParsedData> {
  parseStoredActivityFile(input: {
    activityFilePath: string;
    fileType: ActivityFileType;
    removeOnParseFailure: false;
  }): Promise<ParseStoredActivityFileResult<TParsedData>>;
  upsertExistingActivityFileEnrichment(
    db: DbClient,
    input: {
      activityId: string;
      profileId: string;
      activityType: string;
      activityFilePath: string;
      activityFileSize: number | null;
      activityFileType: ActivityFileType;
      parsedData: TParsedData;
    },
  ): Promise<void>;
  logger: LoggerLike;
}

export interface ProcessUploadedActivityFileResult {
  activity: ActivityRow;
  ingestion: Pick<ActivityFileIngestionRow, "id" | "status" | "activity_id">;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
    };
  }

  return {
    errorMessage: undefined,
    errorStack: undefined,
    errorName: undefined,
  };
}

async function markIngestionFailed(
  db: DbClient,
  logger: LoggerLike,
  input: {
    ingestionId: string;
    profileId: string;
    errorCode: string;
    errorMessage: string;
  },
) {
  try {
    await markFailed(db, {
      id: input.ingestionId,
      profileId: input.profileId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
  } catch (transitionError) {
    logger.error("Failed to mark activity file ingestion failed", getErrorDetails(transitionError));
  }
}

async function loadOwnedActivityFileIngestion(
  db: DbClient,
  input: ProcessUploadedActivityFileInput,
) {
  const [ownerRow] = await db
    .select({ activity: activities, ingestion: activityFileIngestions })
    .from(activityFileIngestions)
    .innerJoin(activities, eq(activityFileIngestions.activity_id, activities.id))
    .where(
      and(
        eq(activityFileIngestions.id, input.ingestionId),
        eq(activityFileIngestions.activity_id, input.activityId),
        eq(activityFileIngestions.profile_id, input.userId),
        eq(activities.profile_id, input.userId),
      ),
    )
    .limit(1);

  if (!ownerRow) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity file ingestion not found",
    });
  }

  return ownerRow;
}

async function attachFileMetadataToIngestion(
  db: DbClient,
  input: ProcessUploadedActivityFileInput,
) {
  await db
    .update(activityFileIngestions)
    .set({
      file_path: input.activityFilePath,
      file_size: input.fileSize ?? null,
      file_type: input.fileType,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(activityFileIngestions.id, input.ingestionId),
        eq(activityFileIngestions.activity_id, input.activityId),
        eq(activityFileIngestions.profile_id, input.userId),
      ),
    );
}

async function advanceUploadedIngestion(
  db: DbClient,
  input: ProcessUploadedActivityFileInput,
  ingestion: ActivityFileIngestionRow,
) {
  let processingIngestion = ingestion;
  const currentStatus = String(ingestion.status);

  if (currentStatus === "pending_upload" || currentStatus === "failed") {
    processingIngestion = await markUploaded(db, {
      id: input.ingestionId,
      profileId: input.userId,
    });
  }

  if (String(processingIngestion.status) === "uploaded") {
    processingIngestion = await markProcessing(db, {
      id: input.ingestionId,
      profileId: input.userId,
    });
  }

  return processingIngestion;
}

export async function processUploadedActivityFile<TParsedData>(
  db: DbClient,
  input: ProcessUploadedActivityFileInput,
  deps: ProcessUploadedActivityFileDependencies<TParsedData>,
): Promise<ProcessUploadedActivityFileResult> {
  const { activity, ingestion } = await loadOwnedActivityFileIngestion(db, input);

  try {
    await attachFileMetadataToIngestion(db, input);
    await advanceUploadedIngestion(db, input, ingestion);

    const { activityFile, parsedData } = await deps.parseStoredActivityFile({
      activityFilePath: input.activityFilePath,
      fileType: input.fileType,
      removeOnParseFailure: false,
    });

    await deps.upsertExistingActivityFileEnrichment(db, {
      activityId: input.activityId,
      profileId: input.userId,
      activityType: activity.type,
      activityFilePath: input.activityFilePath,
      activityFileSize: input.fileSize ?? activityFile.size ?? null,
      activityFileType: input.fileType,
      parsedData,
    });

    const readyIngestion = await markReady(db, {
      id: input.ingestionId,
      profileId: input.userId,
    });

    const updatedActivity =
      (await db.query.activities.findFirst({ where: eq(activities.id, input.activityId) })) ??
      activity;

    return {
      activity: updatedActivity,
      ingestion: readyIngestion,
    };
  } catch (error) {
    if (error instanceof TRPCError && error.code !== "FORBIDDEN" && error.code !== "NOT_FOUND") {
      await markIngestionFailed(db, deps.logger, {
        ingestionId: input.ingestionId,
        profileId: input.userId,
        errorCode: error.code === "BAD_REQUEST" ? "parse_failed" : "process_failed",
        errorMessage: error.message,
      });
    }

    if (error instanceof TRPCError) {
      throw error;
    }

    await markIngestionFailed(db, deps.logger, {
      ingestionId: input.ingestionId,
      profileId: input.userId,
      errorCode: "process_failed",
      errorMessage: getErrorMessage(error),
    });

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Activity file processing failed: ${getErrorMessage(error)}`,
      cause: error,
    });
  }
}
