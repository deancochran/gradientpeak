import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File } from "expo-file-system";
import type { RecordingSessionArtifact } from "./types";

const PENDING_FINALIZED_ARTIFACT_KEY = "activity-recorder:pending-finalized-artifact";

export async function persistPendingFinalizedArtifact(
  artifact: RecordingSessionArtifact,
): Promise<void> {
  await AsyncStorage.setItem(PENDING_FINALIZED_ARTIFACT_KEY, JSON.stringify(artifact));
}

export async function loadPendingFinalizedArtifact(): Promise<RecordingSessionArtifact | null> {
  const raw = await AsyncStorage.getItem(PENDING_FINALIZED_ARTIFACT_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RecordingSessionArtifact;
  } catch (error) {
    console.warn("[finalizedArtifactStorage] Failed to parse pending artifact", error);
    await AsyncStorage.removeItem(PENDING_FINALIZED_ARTIFACT_KEY);
    return null;
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

  if (artifact.fitFilePath) {
    try {
      const fitFile = new File(artifact.fitFilePath);
      if (fitFile.exists) {
        fitFile.delete();
      }
    } catch (error) {
      console.warn("[finalizedArtifactStorage] Failed to delete FIT file", error);
    }
  }

  for (const streamArtifactPath of artifact.streamArtifactPaths) {
    try {
      const directory = new Directory(streamArtifactPath);
      if (directory.exists) {
        directory.delete();
      }
    } catch (error) {
      console.warn("[finalizedArtifactStorage] Failed to delete stream artifact", error);
    }
  }
}
