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

import { invalidatePostActivityIngestionQueries, queryKeys } from "@repo/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { getServerConfig } from "@/lib/server-config";
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
import { ActivityFileUploader } from "@/lib/services/fit/ActivityFileUploader";

// ================================
// Types
// ================================

type SubmissionPhase = "loading" | "ready" | "uploading" | "success" | "error";

interface SubmissionState {
  phase: SubmissionPhase;
  artifact: RecordingSessionArtifact | null;
  activity: PreparedRecordedActivityDraft | null;
  error: string | null;
  hasStreams: boolean;
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
      updates: { name?: string; notes?: string; is_private?: boolean };
    }
  | { type: "UPLOADING" }
  | { type: "SUCCESS" }
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
      };

    case "UPDATE":
      if (!state.activity) return state;
      return {
        ...state,
        activity: { ...state.activity, ...action.updates },
      };

    case "UPLOADING":
      return { ...state, phase: "uploading", error: null };

    case "SUCCESS":
      return { ...state, phase: "success" };

    case "ERROR":
      return { ...state, phase: "error", error: action.error };

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

type ProcessActivityFileSubmission = {
  activityType: PreparedRecordedActivityDraft["activityType"];
  name: string;
  notes?: string;
};

function toProcessActivityFileSubmission(
  activity: PreparedRecordedActivityDraft,
): ProcessActivityFileSubmission {
  return {
    activityType: activity.activityType,
    name: activity.name,
    notes: activity.notes ?? undefined,
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

      const profileId = service?.recordingMetadata?.profileId ?? profile?.id;

      if (!profileId) {
        throw new Error("No profile found for activity submission");
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

  const update = useCallback((updates: { name?: string; notes?: string }) => {
    dispatch({ type: "UPDATE", updates });
  }, []);

  const processActivityFileMutation = api.activityFiles.processActivityFile.useMutation({
    onSuccess: async (data) => {
      await invalidatePostActivityIngestionQueries(queryClient);

      // Set the new activity in cache
      if (data.activity?.id) {
        queryClient.setQueryData(queryKeys.activities.detail(data.activity.id), data.activity);
      }

      console.log("[useActivitySubmission] Activity processed successfully via activity file.");
    },
    onError: (error) => {
      // Don't show Alert here - let submitOnce handle it to avoid duplicate alerts
      console.error("[useActivitySubmission] Processing failed:", error);
    },
  });

  const getSignedUrlMutation = api.activityFiles.getSignedUploadUrl.useMutation();

  // ================================
  // Single Upload Attempt (No Automatic Retry)
  // ================================

  const submitOnce = useCallback(
    async (artifact: RecordingSessionArtifact, activity: PreparedRecordedActivityDraft) => {
      try {
        console.log(`[useActivitySubmission] Uploading activity file:`, artifact.activityFilePath);

        // Simple file verification
        const { File } = await import("expo-file-system");
        if (!artifact.activityFilePath) {
          throw new Error("Activity file does not exist");
        }

        const file = new File(artifact.activityFilePath);

        if (!file.exists) {
          throw new Error("Activity file does not exist");
        }

        const fileSize = file.size ?? 0;

        if (fileSize === 0) {
          throw new Error("Activity file is empty");
        }

        console.log(`[useActivitySubmission] File verification successful: ${fileSize} bytes`);
        const fileName = `${Date.now()}.fit`;

        // 1. Get signed upload URL from backend
        console.log("[useActivitySubmission] Requesting signed upload URL...");
        const signedUrlData = await getSignedUrlMutation.mutateAsync({
          fileName,
          fileSize,
        });

        console.log("[useActivitySubmission] Got signed URL for path:", signedUrlData.filePath);

        const supabaseUrl = getServerConfig().supabaseUrl;
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

        const uploader = new ActivityFileUploader(supabaseUrl, supabaseAnonKey, "activity-files");

        // 2. Upload to signed URL
        const uploadResult = await uploader.uploadToSignedUrl(
          artifact.activityFilePath,
          signedUrlData.signedUrl,
        );

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Failed to upload activity file");
        }

        console.log("[useActivitySubmission] Activity file uploaded successfully");

        // CRITICAL: Wait for storage to sync (especially on iOS/Supabase)
        // This prevents "Failed to download" errors when processing immediately after upload
        const syncDelay = 1000; // 1 second should be sufficient
        console.log(`[useActivitySubmission] Waiting ${syncDelay}ms for storage to sync...`);
        await new Promise((resolve) => setTimeout(resolve, syncDelay));

        // 3. Process the uploaded file
        console.log(
          "[useActivitySubmission] Calling API processActivityFile with path:",
          signedUrlData.filePath,
        );

        const result = await processActivityFileMutation.mutateAsync({
          activityFilePath: signedUrlData.filePath,
          ...toProcessActivityFileSubmission(activity),
        });

        if (!result.success) {
          throw new Error("Activity file processing failed");
        }

        await clearPendingFinalizedArtifact();
        await deleteFinalizedArtifactFiles(artifact);

        console.log(
          "[useActivitySubmission] Activity processed, cache invalidated, and local artifacts deleted",
        );
        dispatch({ type: "SUCCESS" });
      } catch (err) {
        console.error(`[useActivitySubmission] Upload failed:`, err);

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
    [getSignedUrlMutation, processActivityFileMutation],
  );

  const submit = useCallback(async () => {
    if (!state.activity || !state.artifact) {
      throw new Error("No data to submit");
    }

    dispatch({ type: "UPLOADING" });

    try {
      if (state.artifact.activityFilePath) {
        await submitOnce(state.artifact, {
          ...state.activity,
          notes: state.activity.notes ?? undefined,
        });
        return true;
      } else {
        // No activity file found
        console.error("[useActivitySubmission] No activity file found in recording metadata");
        throw new Error("No activity file generated. Please try recording again.");
      }
    } catch (err) {
      console.error("[useActivitySubmission] Upload failed:", err);

      // Error state is already set by submitOnce
      // Don't throw - keep the submission page available for manual retry
      return false;
    }
  }, [state.activity, state.artifact, submitOnce]);

  // ================================
  // Return Clean API
  // ================================

  return {
    // State flags
    isLoading: state.phase === "loading",
    isReady: state.phase === "ready",
    isUploading: state.phase === "uploading",
    isSuccess: state.phase === "success",
    isError: state.phase === "error",

    // Data (null-safe access)
    artifact: state.artifact,
    activity: state.activity,
    error: state.error,
    hasStreams: state.hasStreams,

    // Actions
    update,
    submit,
  };
}
