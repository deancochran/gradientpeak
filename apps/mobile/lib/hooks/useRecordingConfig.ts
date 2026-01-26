/**
 * React hooks for recording configuration
 *
 * Provides capability-based feature flags for UI components
 */

import type { RecordingCapabilities, RecordingConfiguration } from "@repo/core";
import { useEffect, useState } from "react";
import type { ActivityRecorderService } from "../services/ActivityRecorder";
import { isEqual } from "lodash";

/**
 * Get the current recording configuration
 * Automatically recomputes when relevant state changes
 */
export function useRecordingConfig(
  service: ActivityRecorderService | null,
): RecordingConfiguration | null {
  const [config, setConfig] = useState<RecordingConfiguration | null>(null);

  useEffect(() => {
    if (!service) {
      setConfig(null);
      return;
    }

    // Compute initial config
    const updateConfig = () => {
      const newConfig = service.getRecordingConfiguration();
      setConfig((prev) => {
        if (isEqual(prev, newConfig)) return prev;
        return newConfig;
      });
    };

    updateConfig();

    // Recompute when these events fire
    const events = [
      "activitySelected",
      "planSelected",
      "planCleared",
      "sensorsChanged",
      "stateChanged",
    ] as const;

    events.forEach((event) => {
      service.addListener(event as any, updateConfig);
    });

    return () => {
      events.forEach((event) => {
        service.removeListener(event as any, updateConfig);
      });
    };
  }, [service]);

  return config;
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

/**
 * Get validation errors/warnings
 * Useful for showing pre-recording checks
 */
export function useRecordingValidation(
  service: ActivityRecorderService | null,
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const capabilities = useRecordingCapabilities(service);

  return {
    isValid: capabilities?.isValid ?? true,
    errors: capabilities?.errors ?? [],
    warnings: capabilities?.warnings ?? [],
  };
}
