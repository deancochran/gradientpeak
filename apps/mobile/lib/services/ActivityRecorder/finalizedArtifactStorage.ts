import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordingSessionArtifactSchema } from "@repo/core";
import { Directory, File } from "expo-file-system";
import type { RecordingSessionArtifact } from "./types";

export const PENDING_FINALIZED_ARTIFACT_KEY = "activity-recorder:v3:pending-finalized-artifact";

export function finalizedArtifactReferencesLocalFiles(
  artifact: RecordingSessionArtifact | null,
): boolean {
  return Boolean(
    artifact && (artifact.activityFilePath || (artifact.streamArtifactPaths?.length ?? 0) > 0),
  );
}

export async function persistPendingFinalizedArtifact(
  artifact: RecordingSessionArtifact,
): Promise<void> {
  const parsed = recordingSessionArtifactSchema.parse(artifact);
  await AsyncStorage.setItem(PENDING_FINALIZED_ARTIFACT_KEY, JSON.stringify(parsed));
}

export async function loadPendingFinalizedArtifact(): Promise<RecordingSessionArtifact | null> {
  const raw = await AsyncStorage.getItem(PENDING_FINALIZED_ARTIFACT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    if (!stored.profileId && typeof stored.sessionId === "string") {
      stored.profileId = stored.sessionId.split(":")[0] || stored.sessionId;
    }
    return recordingSessionArtifactSchema.parse(stored);
  } catch (error) {
    throw new Error("Stored finalized activity artifact is unreadable", { cause: error });
  }
}

export async function clearPendingFinalizedArtifact(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_FINALIZED_ARTIFACT_KEY);
}

export async function deleteFinalizedArtifactFiles(
  artifact: RecordingSessionArtifact | null,
): Promise<void> {
  if (!artifact) {
    return;
  }

  if (artifact.activityFilePath) {
    try {
      const activityFile = new File(artifact.activityFilePath);
      if (activityFile.exists) {
        activityFile.delete();
      }
    } catch {}
  }

  for (const streamArtifactPath of artifact.streamArtifactPaths) {
    try {
      const directory = new Directory(streamArtifactPath);
      if (directory.exists) {
        directory.delete();
      }
    } catch {}
  }
}
