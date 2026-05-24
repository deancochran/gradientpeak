/**
 * React hooks for recording configuration
 *
 * Provides capability-based feature flags for UI components
 */

import type {
  RecordingCapabilities,
  RecordingConfiguration,
  RecordingSessionContract,
} from "@repo/core";
import { useMemo } from "react";
import type { ActivityRecorderService } from "../services/ActivityRecorder";
import { useSessionView } from "./useActivityRecorder";

/**
 * Get the current recording configuration
 * Compatibility selector over the canonical session view.
 */
export function useRecordingConfig(
  service: ActivityRecorderService | null,
): RecordingConfiguration | null {
  const sessionView = useSessionView(service);

  return useMemo(() => sessionView?.recordingConfiguration ?? null, [sessionView]);
}

/**
 * Get just the capabilities (what to show/do)
 * This is what most components need
 */
export function useRecordingCapabilities(
  service: ActivityRecorderService | null,
): RecordingCapabilities | null {
  const config = useRecordingConfig(service);
  return config?.capabilities ?? null;
}

export function useRecordingSessionContract(
  service: ActivityRecorderService | null,
): RecordingSessionContract | null {
  const config = useRecordingConfig(service);
  return config?.session ?? null;
}

/**
 * Get validation errors/warnings
 * Useful for showing pre-recording checks
 */
export function useRecordingValidation(service: ActivityRecorderService | null): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const capabilities = useRecordingCapabilities(service);

  return {
    isValid: capabilities?.isValid ?? true,
    errors: capabilities?.errors ?? [],
    warnings: capabilities?.warnings ?? [],
  };
}
