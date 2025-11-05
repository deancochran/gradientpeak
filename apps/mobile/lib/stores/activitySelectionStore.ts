import { ActivityPayload } from "@repo/core";

/**
 * ActivitySelectionStore - Simple singleton store for activity selection
 *
 * This store manages the activity selection state for navigation between
 * record launcher, follow-along, and record screens without URL parameters.
 *
 * Key features:
 * - Consume-once pattern: selection is cleared after being read
 * - Reset on record-launcher mount for fresh state
 * - No encoding/decoding complexity
 * - Clean navigation with no URL parameters
 */
class ActivitySelectionStore {
  private selection: ActivityPayload | null = null;

  /**
   * Set a new activity selection
   */
  setSelection(payload: ActivityPayload): void {
    console.log("[ActivitySelectionStore] Setting selection:", {
      type: payload.type,
      hasPlan: !!payload.plan,
      plannedActivityId: payload.plannedActivityId,
    });
    this.selection = payload;
  }

  /**
   * Get and clear selection (consume-once pattern)
   * This ensures each selection is used only once
   */
  consumeSelection(): ActivityPayload | null {
    const current = this.selection;
    if (current) {
      console.log("[ActivitySelectionStore] Consuming selection:", current.type);
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
  peekSelection(): ActivityPayload | null {
    return this.selection;
  }

  /**
   * Clear the store completely
   * Called when record-launcher mounts to ensure fresh state
   */
  clear(): void {
    if (this.selection) {
      console.log("[ActivitySelectionStore] Clearing selection:", this.selection.type);
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
  getSelectionInfo(): { hasSelection: boolean; type?: string; hasPlan?: boolean } {
    return {
      hasSelection: this.selection !== null,
      type: this.selection?.type,
      hasPlan: !!this.selection?.plan,
    };
  }
}

// Singleton instance - shared across the app
export const activitySelectionStore = new ActivitySelectionStore();
