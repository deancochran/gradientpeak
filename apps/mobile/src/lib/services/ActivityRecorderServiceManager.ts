/**
 * ActivityRecorderServiceManager
 *
 * Singleton manager to ensure a single ActivityRecorderService instance
 * is shared across all components in the recording flow.
 *
 * This solves the issue where multiple components (recording modal, activity
 * selection modal, etc.) were creating separate service instances, causing
 * state updates in one component to not reflect in others.
 */

import { ActivityRecorderService } from "./ActivityRecorder";
import type { PublicProfilesRow } from "@supabase/supazod/schemas.types";

class ActivityRecorderServiceManager {
  private static instance: ActivityRecorderServiceManager;
  private currentService: ActivityRecorderService | null = null;
  private serviceState: "uninitialized" | "active" | "completed" | "cleanup" =
    "uninitialized";
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ActivityRecorderServiceManager {
    if (!ActivityRecorderServiceManager.instance) {
      ActivityRecorderServiceManager.instance =
        new ActivityRecorderServiceManager();
    }
    return ActivityRecorderServiceManager.instance;
  }

  /**
   * Get the current service instance
   */
  getService(): ActivityRecorderService | null {
    return this.currentService;
  }

  /**
   * Get the current service state
   */
  getState(): "uninitialized" | "active" | "completed" | "cleanup" {
    return this.serviceState;
  }

  /**
   * Check if service is ready to use
   */
  isReady(): boolean {
    return this.serviceState === "active" && this.currentService !== null;
  }

  /**
   * Create a new service instance
   */
  async createService(profile: PublicProfilesRow): Promise<ActivityRecorderService> {
    const startTime = Date.now();
    console.log(
      "[ServiceManager] Creating new ActivityRecorderService instance",
      { profileId: profile.id }
    );

    // Cleanup existing service if any
    if (this.currentService) {
      console.log(
        "[ServiceManager] Cleaning up existing service before creating new one"
      );
      await this.cleanup();
    }

    // Create fresh instance
    try {
      const creationStart = Date.now();
      const newService = new ActivityRecorderService(profile);
      this.currentService = newService;
      this.serviceState = "active";

      console.log(
        "[ServiceManager] New ActivityRecorderService instance created successfully",
        {
          profileId: profile.id,
          creationTime: `${Date.now() - creationStart}ms`,
          totalTime: `${Date.now() - startTime}ms`,
        }
      );

      // Notify all listeners that service was created
      this.notifyListeners();

      return newService;
    } catch (error) {
      console.error(
        "[ServiceManager] Failed to create new service instance:",
        error
      );
      this.serviceState = "uninitialized";
      throw error;
    }
  }

  /**
   * Mark service as completed (ready for cleanup)
   */
  markCompleted(): void {
    console.log("[ServiceManager] Marking service as completed");
    this.serviceState = "completed";
    this.notifyListeners();
  }

  /**
   * Cleanup the current service
   */
  async cleanup(): Promise<void> {
    if (!this.currentService) {
      return;
    }

    const startTime = Date.now();
    console.log("[ServiceManager] Cleaning up service");
    this.serviceState = "cleanup";
    this.notifyListeners();

    try {
      await this.currentService.cleanup();
      console.log("[ServiceManager] Service cleanup completed successfully", {
        duration: `${Date.now() - startTime}ms`,
      });
    } catch (error) {
      console.error("[ServiceManager] Error during service cleanup:", error);
      // Continue with cleanup even if error occurs
    } finally {
      this.currentService = null;
      this.serviceState = "uninitialized";
      console.log("[ServiceManager] Service instance deallocated and state reset");
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to service changes
   * Returns an unsubscribe function
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static reset(): void {
    if (ActivityRecorderServiceManager.instance) {
      ActivityRecorderServiceManager.instance.cleanup();
      ActivityRecorderServiceManager.instance = null as any;
    }
  }
}

// Export singleton instance
export const serviceManager = ActivityRecorderServiceManager.getInstance();

// Export type for reference
export type { ActivityRecorderServiceManager };
