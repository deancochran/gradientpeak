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
import { getApiStorageService } from "../../storage-service";
import type { ActivityArtifactSubmission } from "../activities/submit-activity";
import { cleanupActivityArtifactStaging, promoteActivityArtifact } from "./artifact-storage";
import { markFailed, markProcessing, markUploaded } from "./ingestion-state";

type DbClient = ReturnType<typeof getRequiredDb>;

interface LoggerLike {
  error(message: string, metadata?: unknown): void;
}

interface ReadStoredActivityFileResult {
  activityFile: { size?: number | null };
  data: Uint8Array;
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
  readStoredActivityFile(input: {
    activityFilePath: string;
    removeOnParseFailure: false;
  }): Promise<ReadStoredActivityFileResult>;
  decodeActivityFile(input: {
    data: Uint8Array;
    activityFilePath: string;
    fileType: ActivityFileType;
  }): TParsedData;
  upsertExistingActivityFileEnrichment(
    db: DbClient,
    input: {
      activity: ActivityRow;
      artifact: ActivityArtifactSubmission;
      ingestion: ActivityFileIngestionRow;
      claimToken: string;
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
    claimToken?: string;
  },
) {
  try {
    await markFailed(db, {
      id: input.ingestionId,
      profileId: input.profileId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      claimToken: input.claimToken,
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

async function promoteArtifact(input: ProcessUploadedActivityFileInput, data: Uint8Array) {
  return promoteActivityArtifact(getApiStorageService(), {
    profileId: input.userId,
    bucket: "activity-files",
    stagingPath: input.activityFilePath,
    bytes: data,
    format: input.fileType,
  });
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
  let claimToken: string | undefined;

  try {
    const processingIngestion = await advanceUploadedIngestion(db, input, ingestion);
    if (!processingIngestion.claim_token) {
      throw new TRPCError({ code: "CONFLICT", message: "Activity file ingestion claim was lost" });
    }
    claimToken = processingIngestion.claim_token;

    const { data } = await deps.readStoredActivityFile({
      activityFilePath: input.activityFilePath,
      removeOnParseFailure: false,
    });
    const artifact = await promoteArtifact(input, data);
    const parsedData = deps.decodeActivityFile({
      data,
      activityFilePath: input.activityFilePath,
      fileType: input.fileType,
    });

    await deps.upsertExistingActivityFileEnrichment(db, {
      activity,
      artifact,
      ingestion: processingIngestion,
      claimToken: processingIngestion.claim_token,
      parsedData,
    });

    const readyIngestion =
      (await db.query.activityFileIngestions.findFirst({
        where: and(
          eq(activityFileIngestions.id, input.ingestionId),
          eq(activityFileIngestions.profile_id, input.userId),
        ),
      })) ?? processingIngestion;

    const updatedActivity =
      (await db.query.activities.findFirst({ where: eq(activities.id, input.activityId) })) ??
      activity;

    await cleanupActivityArtifactStaging(getApiStorageService(), artifact);

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
        claimToken,
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
      claimToken,
    });

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Activity file processing failed: ${getErrorMessage(error)}`,
      cause: error,
    });
  }
}
