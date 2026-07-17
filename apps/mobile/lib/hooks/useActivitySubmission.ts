/**
 * useActivitySubmission - Automatic Activity Processing & Upload
 *
 * Add this to your useActivityRecorder hooks file.
 * Automatically processes finished recording data and prepares for upload.
 *
 * @example
 * ```tsx
 * // In your submit screen:
 * function SubmitScreen() {
 *   const service = useSharedActivityRecorder();
 *   const submission = useActivitySubmission(service);
 *
 *   if (submission.isLoading) return <Spinner />;
 *   if (submission.isError) return <Error error={submission.error} />;
 *
 *   return (
 *     <Form>
 *       <Input
 *         value={submission.activity.name}
 *         onChangeText={(name) => submission.update({ name })}
 *       />
 *       <Button onPress={submission.submit}>Save Activity</Button>
 *     </Form>
 *   );
 * }
 * ```
 */

import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  clearPendingFinalizedArtifact,
  deleteFinalizedArtifactFiles,
  loadPendingFinalizedArtifact,
} from "@/lib/services/ActivityRecorder/finalizedArtifactStorage";
import type { RecordingSessionArtifact } from "@/lib/services/ActivityRecorder/types";
// import * as FileSystem from "expo-file-system"; // Removed as we use File class now

import { useCallback, useEffect, useReducer } from "react";
import type { PreparedRecordedActivityDraft } from "@/lib/contracts/activity-submission";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  type ActivitySubmissionQueueDraft,
  type ActivitySubmissionQueueJob,
  type ActivitySubmissionQueueJobStatus,
  loadActivitySubmissionQueueJobByArtifactId,
  runActivitySubmissionQueueJob,
  upsertActivitySubmissionQueueJob,
} from "@/lib/services/activitySubmissionQueue";
import { getLocalActivityArtifactMetadata } from "@/lib/services/activitySubmissionQueue/localArtifact";
import { ActivityFileUploader } from "@/lib/services/fit/ActivityFileUploader";

// ================================
// Types
// ================================

type SubmissionPhase =
  | "loading"
  | "ready"
  | "preparing"
  | "queued"
  | "uploading"
  | "processing"
  | "success"
  | "error";

interface SubmissionState {
  phase: SubmissionPhase;
  artifact: RecordingSessionArtifact | null;
  activity: PreparedRecordedActivityDraft | null;
  error: string | null;
  hasStreams: boolean;
  activityId: string | null;
  queueStatus: ActivitySubmissionQueueJobStatus | null;
}

type Action =
  | {
      type: "READY";
      artifact: RecordingSessionArtifact;
      activity: PreparedRecordedActivityDraft;
      hasStreams: boolean;
    }
  | {
      type: "UPDATE";
      updates: {
        name?: string;
        notes?: string | null;
        content_visibility?: ActivitySubmissionQueueDraft["content_visibility"];
      };
    }
  | { type: "QUEUE_STATUS"; status: ActivitySubmissionQueueJobStatus; activityId?: string | null }
  | { type: "SUCCESS"; activityId?: string | null }
  | { type: "ERROR"; error: string };

// ================================
// Reducer
// ================================

function submissionReducer(state: SubmissionState, action: Action): SubmissionState {
  switch (action.type) {
    case "READY":
      return {
        phase: "ready",
        artifact: action.artifact,
        activity: action.activity,
        error: null,
        hasStreams: action.hasStreams,
        activityId: null,
        queueStatus: null,
      };

    case "UPDATE":
      if (!state.activity) return state;
      return {
        ...state,
        activity: { ...state.activity, ...action.updates },
      };

    case "QUEUE_STATUS": {
      const phaseByStatus: Record<ActivitySubmissionQueueJobStatus, SubmissionPhase> = {
        draft: "preparing",
        creating_activity: "preparing",
        queued: "queued",
        uploading: "uploading",
        processing: "processing",
        complete: "success",
        failed: "error",
      };

      return {
        ...state,
        phase: phaseByStatus[action.status],
        activityId: action.activityId ?? state.activityId,
        error: action.status === "failed" ? state.error : null,
        queueStatus: action.status,
      };
    }

    case "SUCCESS":
      return { ...state, phase: "success", activityId: action.activityId ?? state.activityId };

    case "ERROR":
      return { ...state, phase: "error", error: action.error, queueStatus: "failed" };

    default:
      return state;
  }
}

function buildDefaultActivityName(artifact: RecordingSessionArtifact): string {
  const category = artifact.snapshot.activity.category;
  const gpsLabel = artifact.snapshot.activity.gpsMode === "on" ? "GPS ON" : "GPS OFF";

  return `${category} (${gpsLabel}) - ${new Date(
    artifact.snapshot.identity.startedAt,
  ).toLocaleDateString()}`;
}

function buildActivityFromArtifact(args: {
  artifact: RecordingSessionArtifact;
  profileId: string;
}): PreparedRecordedActivityDraft {
  const { artifact, profileId } = args;

  return {
    profileId,
    startedAt: new Date(artifact.snapshot.identity.startedAt),
    finishedAt: new Date(artifact.completedAt),
    name: buildDefaultActivityName(artifact),
    activityType: artifact.snapshot.activity.category,
    durationSeconds: artifact.finalStats.durationSeconds,
    movingSeconds: artifact.finalStats.movingSeconds,
    distanceMeters: Math.round(artifact.finalStats.distanceMeters),
    calories: artifact.finalStats.calories,
    activityPlanId: artifact.snapshot.activity.activityPlanId,
  };
}

function toQueueDraft(activity: PreparedRecordedActivityDraft) {
  return {
    profileId: activity.profileId,
    startedAt: activity.startedAt.toISOString(),
    finishedAt: activity.finishedAt.toISOString(),
    name: activity.name,
    activityType: activity.activityType,
    durationSeconds: activity.durationSeconds,
    movingSeconds: activity.movingSeconds,
    distanceMeters: activity.distanceMeters,
    calories: activity.calories ?? null,
    notes: activity.notes ?? null,
    content_visibility: activity.content_visibility,
    activityPlanId: activity.activityPlanId ?? null,
  };
}

function buildQueueJob(args: {
  artifact: RecordingSessionArtifact;
  activity: PreparedRecordedActivityDraft;
  fileSize: number | null;
  now: string;
}): ActivitySubmissionQueueJob {
  const artifactId = args.artifact.sessionId;
  if (!args.artifact.executionManifest) {
    throw new Error("Finalized recording is missing its ordered execution manifest");
  }

  return {
    schemaVersion: 2,
    id: artifactId,
    artifactId,
    sessionId: args.artifact.sessionId,
    localActivityFilePath: args.artifact.activityFilePath ?? "",
    localActivityFileSize: args.fileSize,
    streamArtifactPaths: args.artifact.streamArtifactPaths,
    executionManifest: args.artifact.executionManifest,
    draft: {
      ...toQueueDraft(args.activity),
      recordingSessionId: args.artifact.sessionId,
    },
    status: "queued",
    attempts: 0,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

// ================================
// Main Hook
// ================================

export function useActivitySubmission(service: ActivityRecorderService | null) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [state, dispatch] = useReducer(submissionReducer, {
    phase: "loading",
    artifact: null,
    activity: null,
    error: null,
    hasStreams: false,
    activityId: null,
    queueStatus: null,
  });

  // ================================
  // Auto-process recording on recordingComplete event
  // ================================

  const processRecording = useCallback(async () => {
    try {
      console.log("[useActivitySubmission] Processing finalized artifact");

      const artifact = service?.getFinalizedArtifact() ?? (await loadPendingFinalizedArtifact());

      if (!artifact) {
        if (service?.state === "finishing") {
          return;
        }

        throw new Error("No finalized activity artifact found");
      }

      const profileId = profile?.id;
      if (!profileId) {
        throw new Error("No profile found for activity submission");
      }
      if (
        service?.recordingMetadata?.profileId &&
        service.recordingMetadata.profileId !== profileId
      ) {
        throw new Error("Finalized activity belongs to a different profile");
      }
      if (artifact.profileId !== profileId) {
        throw new Error("Finalized activity belongs to a different profile");
      }

      const activity = buildActivityFromArtifact({
        artifact,
        profileId,
      });

      const hasStreams = artifact.streamArtifactPaths.length > 0;

      console.log("[useActivitySubmission] Activity processed successfully");
      dispatch({ type: "READY", artifact, activity, hasStreams });
    } catch (err) {
      console.error("[useActivitySubmission] Processing failed:", err);
      dispatch({
        type: "ERROR",
        error: err instanceof Error ? err.message : "Processing failed",
      });
    }
  }, [profile?.id, service]);

  // Listen for recording completion event
  useEffect(() => {
    processRecording();

    if (!service) return;

    const handleRecordingComplete = () => {
      console.log("[useActivitySubmission] Finalized artifact ready event received");
      processRecording();
    };

    const subscription = service.addListener("artifactReady", handleRecordingComplete);
    return () => {
      subscription.remove();
    };
  }, [service, processRecording]);

  // ================================
  // Actions
  // ================================

  const update = useCallback(
    (updates: {
      name?: string;
      notes?: string | null;
      content_visibility?: ActivitySubmissionQueueDraft["content_visibility"];
    }) => {
      dispatch({ type: "UPDATE", updates });
    },
    [],
  );

  const createActivityMutation = api.activities.createFromRecordingSummary.useMutation();
  const getSignedUrlMutation = api.activityFiles.getSignedUploadUrl.useMutation();

  // ================================
  // Durable Queue Submission
  // ================================

  const submitOnce = useCallback(
    async (artifact: RecordingSessionArtifact, activity: PreparedRecordedActivityDraft) => {
      try {
        console.log(`[useActivitySubmission] Queueing activity file:`, artifact.activityFilePath);

        if (artifact.profileId !== activity.profileId || artifact.profileId !== profile?.id) {
          throw new Error("Activity submission belongs to a different profile");
        }
        const existingJob = await loadActivitySubmissionQueueJobByArtifactId(
          artifact.sessionId,
          artifact.profileId,
        );

        if (existingJob?.status === "complete") {
          if (!existingJob.activityId) {
            throw new Error("Completed activity submission is missing its activity id");
          }

          await clearPendingFinalizedArtifact();
          await deleteFinalizedArtifactFiles(artifact);
          await invalidatePostActivityIngestionQueries(queryClient);
          dispatch({ type: "SUCCESS", activityId: existingJob.activityId });
          return existingJob.activityId;
        }

        let fileSize = existingJob?.localActivityFileSize ?? null;

        if (!existingJob?.remoteFilePath) {
          // A local file is only required until upload progress has been persisted.
          const { File } = await import("expo-file-system");
          const localActivityFilePath =
            existingJob?.localActivityFilePath || artifact.activityFilePath;
          if (!localActivityFilePath) {
            throw new Error("Activity file does not exist");
          }

          const file = new File(localActivityFilePath);

          if (!file.exists) {
            throw new Error("Activity file does not exist");
          }

          fileSize = file.size ?? 0;

          if (fileSize === 0) {
            throw new Error("Activity file is empty");
          }
        }

        const queuedJob =
          existingJob ??
          buildQueueJob({
            artifact,
            activity,
            fileSize,
            now: new Date().toISOString(),
          });
        if (!existingJob) {
          await upsertActivitySubmissionQueueJob(queuedJob);
        }
        dispatch({ type: "QUEUE_STATUS", status: "queued" });

        let resolveActivityCreated!: (activityId: string) => void;
        const activityCreated = new Promise<string>((resolve) => {
          resolveActivityCreated = resolve;
        });
        let createdActivityId: string | null = null;
        const uploader = new ActivityFileUploader();

        const completion = runActivitySubmissionQueueJob(queuedJob, {
          createFromRecordingSummary: createActivityMutation.mutateAsync,
          getLocalArtifactMetadata: getLocalActivityArtifactMetadata,
          getSignedUploadUrl: (input) =>
            getSignedUrlMutation.mutateAsync({
              fileName: input.fileName,
              fileSize: input.fileSize ?? 0,
            }),
          uploadToSignedUrl: (localPath, signedUrl) =>
            uploader.uploadToSignedUrl(localPath, signedUrl),
          onJobUpdated: async (job) => {
            dispatch({
              type: "QUEUE_STATUS",
              status: job.status,
              activityId: job.activityId ?? null,
            });

            if (job.activityId && !createdActivityId) {
              createdActivityId = job.activityId;
              resolveActivityCreated(job.activityId);
            }
          },
        });

        completion
          .then(async (job) => {
            if (job.status !== "complete") {
              dispatch({ type: "ERROR", error: job.lastError || "Activity upload failed" });
              return;
            }

            await clearPendingFinalizedArtifact();
            await deleteFinalizedArtifactFiles(artifact);
            await invalidatePostActivityIngestionQueries(queryClient);
            dispatch({ type: "SUCCESS", activityId: job.activityId });
          })
          .catch((error) => {
            dispatch({
              type: "ERROR",
              error: error instanceof Error ? error.message : String(error),
            });
          });

        const activityId = await Promise.race([
          activityCreated,
          completion.then((job) => {
            if (job.activityId) return job.activityId;
            throw new Error(job.lastError || "Activity creation failed");
          }),
        ]);
        console.log("[useActivitySubmission] Activity artifact accepted for server processing");
        return activityId;
      } catch (err) {
        console.error(`[useActivitySubmission] Submission failed:`, err);

        const errorMessage = err instanceof Error ? err.message : String(err);

        // Extract user-friendly error message
        let userMessage =
          "Failed to upload your activity. Please check your connection and try again.";

        // Check for specific error patterns
        if (errorMessage.includes("Failed to create activity record")) {
          userMessage =
            "Failed to save activity to database. This may be a temporary issue. Please try again.";
        } else if (errorMessage.includes("Failed to download activity file")) {
          userMessage =
            "Upload succeeded but processing failed. The file may not have synchronized yet. Please try again in a moment.";
        } else if (errorMessage.includes("Failed to parse activity file")) {
          userMessage =
            "The activity file appears to be corrupted. Please try recording the activity again.";
        } else if (errorMessage.includes("Activity file does not exist")) {
          userMessage = "Activity file not found. Please try recording the activity again.";
        } else if (errorMessage.includes("zero duration") || errorMessage.includes("empty")) {
          userMessage =
            "Activity has no data or zero duration. Please ensure the recording completed properly.";
        }

        // Show single user-friendly error message
        Alert.alert("Upload Failed", userMessage);

        // Set error state but keep the submission page available for retry
        dispatch({
          type: "ERROR",
          error: errorMessage,
        });

        // Re-throw to allow caller to handle
        throw err;
      }
    },
    [createActivityMutation, getSignedUrlMutation, profile?.id, queryClient],
  );

  const submit = useCallback(
    async (updates?: {
      name?: string;
      notes?: string | null;
      content_visibility?: ActivitySubmissionQueueDraft["content_visibility"];
    }) => {
      if (!state.activity || !state.artifact) {
        throw new Error("No data to submit");
      }

      const activityForSubmit = { ...state.activity, ...updates };

      dispatch({ type: "QUEUE_STATUS", status: "queued" });

      try {
        if (state.artifact.activityFilePath) {
          await submitOnce(state.artifact, {
            ...activityForSubmit,
            notes: activityForSubmit.notes ?? null,
          });
          return true;
        } else {
          // No activity file found
          console.error("[useActivitySubmission] No activity file found in recording metadata");
          throw new Error("No activity file generated. Please try recording again.");
        }
      } catch (err) {
        console.error("[useActivitySubmission] Submission failed:", err);

        // Error state is already set by submitOnce
        // Don't throw - keep the submission page available for manual retry
        return false;
      }
    },
    [state.activity, state.artifact, submitOnce],
  );

  const isSubmitting =
    state.phase === "preparing" ||
    state.phase === "queued" ||
    state.phase === "uploading" ||
    state.phase === "processing";
  const statusMessage =
    state.phase === "preparing"
      ? "Preparing activity..."
      : state.phase === "queued"
        ? "Activity queued for upload."
        : state.phase === "uploading"
          ? "Uploading activity file..."
          : state.phase === "processing"
            ? "Processing activity details..."
            : state.phase === "success"
              ? "Activity saved. Upload processing is complete."
              : state.phase === "error"
                ? state.error || "Activity upload failed. You can retry."
                : null;

  // ================================
  // Return Clean API
  // ================================

  return {
    // State flags
    isLoading: state.phase === "loading",
    isReady: state.phase === "ready",
    isUploading: isSubmitting,
    isSubmitting,
    isSuccess: state.phase === "success",
    isError: state.phase === "error",

    // Data (null-safe access)
    artifact: state.artifact,
    activity: state.activity,
    error: state.error,
    hasStreams: state.hasStreams,
    activityId: state.activityId,
    queueStatus: state.queueStatus,
    statusMessage,

    // Actions
    update,
    submit,
  };
}
