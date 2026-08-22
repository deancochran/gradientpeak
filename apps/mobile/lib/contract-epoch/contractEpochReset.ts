import { CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";

export const CONTRACT_EPOCH_STORAGE_KEY = "gradientpeak:contract-epoch";

// These are app-owned AsyncStorage values only. Auth uses SecureStore and the
// server override has its own SecureStore owner, so neither belongs here.
export const CONTRACT_EPOCH_RESET_STORAGE_KEYS = [
  "gradientpeak-theme-store",
  "gradientpeak-calendar-store",
  "gradientpeak-plan-display-preferences",
  "location_buffer",
  "last_location_time",
  "background_location_session_id",
  "@sensors:persisted_devices",
  "activity-plan-structure-chart-hint-seen-v1",
] as const;

export type ContractEpochDependencies = {
  getMarker: () => Promise<string | null>;
  setMarker: (value: string) => Promise<void>;
  clearOnboardingRecovery: () => Promise<void>;
  clearSecureAuthState: () => Promise<void>;
  clearAppStorage: (keys: readonly string[]) => Promise<void>;
  resetRecordingEvidence: () => Promise<void>;
  cleanupStreamFiles: () => Promise<void>;
  cleanupFitFiles: () => Promise<void>;
};

export function createContractEpochInitializer(dependencies: ContractEpochDependencies) {
  return async function initializeContractEpoch(): Promise<"current" | "reset"> {
    if ((await dependencies.getMarker()) === String(CURRENT_CONTRACT_EPOCH)) return "current";

    // A mismatched marker has no migration path. Every destructive operation is
    // idempotent, and the marker is deliberately last so an interruption retries.
    await dependencies.clearOnboardingRecovery();
    await dependencies.clearSecureAuthState();
    await dependencies.resetRecordingEvidence();
    await dependencies.clearAppStorage(CONTRACT_EPOCH_RESET_STORAGE_KEYS);
    await dependencies.cleanupStreamFiles();
    await dependencies.cleanupFitFiles();
    await dependencies.setMarker(String(CURRENT_CONTRACT_EPOCH));
    return "reset";
  };
}
