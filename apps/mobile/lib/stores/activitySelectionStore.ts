import type { ActivityPayload, RecordingActivityCategory } from "@repo/core";
import { omitUndefined } from "@/lib/omitUndefined";

export interface RecordingLaunchPayload extends ActivityPayload {
  launchSource: "record_tab" | "activity_plan" | "calendar_event" | "route" | "manual";
  routeId?: string | null;
}

export function defaultRecordLaunchPayload(
  activity_category: RecordingActivityCategory = "bike",
): RecordingLaunchPayload {
  return {
    launchSource: "record_tab",
    activity_category,
    // Recording opens for an indoor ride first. GPS stays opt-in for outdoor sessions.
    gpsRecordingEnabled: false,
  };
}

/**
 * ActivitySelectionStore - Simple singleton store for activity selection
 *
 * This store manages the activity selection state for navigation to the
 * record screen without URL parameters.
 *
 * Key features:
 * - Consume-once pattern: selection is cleared after being read
 * - Reset on record-launcher mount for fresh state
 * - No encoding/decoding complexity
 * - Clean navigation with no URL parameters
 */
class ActivitySelectionStore {
  private selection: RecordingLaunchPayload | null = null;

  /**
   * Set a new activity selection
   */
  setSelection(payload: RecordingLaunchPayload): void {
    console.log("[ActivitySelectionStore] Setting selection:", {
      launchSource: payload.launchSource,
      activity_category: payload.activity_category,
      gpsRecordingEnabled: payload.gpsRecordingEnabled,
      hasPlan: !!payload.plan,
      eventId: payload.eventId,
      routeId: payload.routeId ?? null,
    });
    this.selection = payload;
  }

  /**
   * Get and clear selection (consume-once pattern)
   * This ensures each selection is used only once
   */
  consumeSelection(): RecordingLaunchPayload | null {
    const current = this.selection;
    if (current) {
      console.log(
        "[ActivitySelectionStore] Consuming selection:",
        current.activity_category,
        current.gpsRecordingEnabled,
      );
      this.selection = null;
    } else {
      console.log("[ActivitySelectionStore] No selection to consume");
    }
    return current;
  }

  /**
   * Peek at selection without consuming it
   * Useful for debugging or conditional logic
   */
  peekSelection(): RecordingLaunchPayload | null {
    return this.selection;
  }

  /**
   * Clear the store completely
   * Called when record-launcher mounts to ensure fresh state
   */
  clear(): void {
    if (this.selection) {
      console.log(
        "[ActivitySelectionStore] Clearing selection:",
        this.selection.activity_category,
        this.selection.gpsRecordingEnabled,
      );
    } else {
      console.log("[ActivitySelectionStore] Clearing empty store");
    }
    this.selection = null;
  }

  /**
   * Check if selection exists without consuming
   */
  hasSelection(): boolean {
    return this.selection !== null;
  }

  /**
   * Get selection info for debugging
   */
  getSelectionInfo(): {
    hasSelection: boolean;
    activity_category?: string;
    gpsRecordingEnabled?: boolean;
    hasPlan?: boolean;
  } {
    return omitUndefined({
      hasSelection: this.selection !== null,
      activity_category: this.selection?.activity_category,
      gpsRecordingEnabled: this.selection?.gpsRecordingEnabled,
      hasPlan: !!this.selection?.plan,
    });
  }
}

// Singleton instance - shared across the app
export const activitySelectionStore = new ActivitySelectionStore();
