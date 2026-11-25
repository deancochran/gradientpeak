import AsyncStorage from "@react-native-async-storage/async-storage";
import { activityRecorderCheckpointSchema } from "@/lib/services/ActivityRecorder/checkpointStorage";
import { migrateRecordingEvidenceForContractEpoch } from "@/lib/services/ActivityRecorder/recordingEvidenceJournal";
import {
  CONTRACT_EPOCH_MIGRATION_STORAGE_KEY,
  CONTRACT_EPOCH_STORAGE_KEY,
  createContractEpochInitializer,
} from "./contractEpochMigration";

export {
  CONTRACT_EPOCH_MIGRATION_STORAGE_KEY,
  CONTRACT_EPOCH_STORAGE_KEY,
  createContractEpochInitializer,
} from "./contractEpochMigration";

const initialize = createContractEpochInitializer({
  getMarker: () => AsyncStorage.getItem(CONTRACT_EPOCH_STORAGE_KEY),
  setMarker: (value) => AsyncStorage.setItem(CONTRACT_EPOCH_STORAGE_KEY, value),
  getMigrationJournal: () => AsyncStorage.getItem(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY),
  setMigrationJournal: (value) => AsyncStorage.setItem(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY, value),
  migrateRecordingEvidence: ({ sourceEpoch, targetEpoch }) =>
    migrateRecordingEvidenceForContractEpoch({
      sourceEpoch,
      targetEpoch,
      isCheckpointCompatible: (checkpointJson) => {
        try {
          const checkpoint = JSON.parse(checkpointJson) as { variant?: unknown };
          return (
            checkpoint.variant === "unplanned" &&
            activityRecorderCheckpointSchema.safeParse(checkpoint).success
          );
        } catch {
          return false;
        }
      },
    }),
});

let initialization: Promise<"current" | "migrated"> | undefined;

/** A process-wide startup fence; failures are not cached so Retry is meaningful. */
export function initializeContractEpoch(): Promise<"current" | "migrated"> {
  initialization ??= initialize().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export function resetContractEpochInitializationForTests(): void {
  initialization = undefined;
}
