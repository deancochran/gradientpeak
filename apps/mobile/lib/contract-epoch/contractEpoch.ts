import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearMobileAuthSessionCacheForContractEpoch } from "@/lib/auth/client";
import { clearSecureAuthStateForContractEpoch } from "@/lib/auth/secure-session-cache";
import { clearAllOnboardingRecoveryForContractEpoch } from "@/lib/onboarding/onboarding-recovery";
import { resetRecordingEvidenceJournal } from "@/lib/services/ActivityRecorder/recordingEvidenceJournal";
import { StreamBuffer } from "@/lib/services/ActivityRecorder/StreamBuffer";
import { GarminFitEncoder } from "@/lib/services/fit/GarminFitEncoder";
import { CONTRACT_EPOCH_STORAGE_KEY, createContractEpochInitializer } from "./contractEpochReset";

export {
  CONTRACT_EPOCH_RESET_STORAGE_KEYS,
  CONTRACT_EPOCH_STORAGE_KEY,
  createContractEpochInitializer,
} from "./contractEpochReset";

const initialize = createContractEpochInitializer({
  getMarker: () => AsyncStorage.getItem(CONTRACT_EPOCH_STORAGE_KEY),
  setMarker: (value) => AsyncStorage.setItem(CONTRACT_EPOCH_STORAGE_KEY, value),
  clearOnboardingRecovery: clearAllOnboardingRecoveryForContractEpoch,
  clearSecureAuthState: async () => {
    clearMobileAuthSessionCacheForContractEpoch();
    await clearSecureAuthStateForContractEpoch();
  },
  clearAppStorage: (keys) => AsyncStorage.multiRemove([...keys]),
  resetRecordingEvidence: resetRecordingEvidenceJournal,
  cleanupStreamFiles: () => StreamBuffer.cleanupOrphanedRecordings(),
  cleanupFitFiles: () => GarminFitEncoder.cleanupOrphanedRecordings(),
});

let initialization: Promise<"current" | "reset"> | undefined;

/** A process-wide startup fence; failures are not cached so Retry is meaningful. */
export function initializeContractEpoch(): Promise<"current" | "reset"> {
  initialization ??= initialize().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export function resetContractEpochInitializationForTests(): void {
  initialization = undefined;
}
