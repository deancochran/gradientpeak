// services/locationManager.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const BACKGROUND_LOCATION_TASK = "background-location-task";
const LOCATION_BUFFER_KEY = "location_buffer";
const MAX_BUFFER_SIZE = 100;

// Static callback registry for background task
const backgroundLocationCallbacks = new Set<
  (location: Location.LocationObject) => void
>();

// Define background location task at module level (required for Expo)
TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<any>) => {
    if (error) {
      console.error("Background location task error:", error);
      return;
    }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };

      // Process each location through callbacks
      for (const location of locations) {
        // Validate location quality
        if (isLocationValid(location)) {
          // Update last location time
          await AsyncStorage.setItem(
            "last_location_time",
            location.timestamp.toString(),
          );

          // Notify all registered callbacks
          backgroundLocationCallbacks.forEach((cb) => {
            try {
              cb(location);
            } catch (e) {
              console.warn("Error in background location callback:", e);
            }
          });
        } else {
          console.warn("Received invalid location in background, skipping");
        }
      }

      // Buffer management for offline storage
      await bufferLocations(locations);
    }
  },
);

// Helper function for location validation
function isLocationValid(location: Location.LocationObject): boolean {
  const { coords } = location;

  // Basic validation
  if (!coords || coords.accuracy === null || coords.accuracy > 50) {
    return false;
  }

  // Check for reasonable lat/lng values
  if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) {
    return false;
  }

  return true;
}

// Helper function for buffering locations
async function bufferLocations(
  locations: Location.LocationObject[],
): Promise<void> {
  try {
    // Get current buffer
    const bufferedStr = await AsyncStorage.getItem(LOCATION_BUFFER_KEY);
    let buffer: Location.LocationObject[] = bufferedStr
      ? JSON.parse(bufferedStr)
      : [];

    // Add new locations
    buffer.push(...locations);

    // Trim buffer if it gets too large
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer = buffer.slice(-MAX_BUFFER_SIZE);
    }

    // Persist to storage
    await AsyncStorage.setItem(LOCATION_BUFFER_KEY, JSON.stringify(buffer));
  } catch (error) {
    console.warn("Failed to buffer locations:", error);
  }
}

export class LocationManager {
  private locationSubscription: Location.LocationSubscription | null = null;
  private locationCallbacks = new Set<
    (location: Location.LocationObject) => void
  >();
  private taskName = BACKGROUND_LOCATION_TASK;
  private locationBuffer: Location.LocationObject[] = [];
  private lastLocationTime = 0;
  private healthCheckInterval: number | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds

  constructor() {
    // Load any existing buffered locations on startup
    this.loadBufferedLocations();
  }

  private async handleLocationUpdate(location: Location.LocationObject) {
    // Update last location time for health monitoring
    this.lastLocationTime = location.timestamp;

    // Validate location quality
    if (!isLocationValid(location)) {
      console.warn("Received invalid location, skipping");
      return;
    }

    this.locationCallbacks.forEach((cb) => {
      try {
        cb(location);
      } catch (e) {
        console.warn("Error in location callback:", e);
      }
    });
  }

  private async loadBufferedLocations(): Promise<void> {
    try {
      const bufferedStr = await AsyncStorage.getItem(LOCATION_BUFFER_KEY);
      if (bufferedStr) {
        this.locationBuffer = JSON.parse(bufferedStr);
        console.log(`Loaded ${this.locationBuffer.length} buffered locations`);
      }
    } catch (error) {
      console.warn("Failed to load buffered locations:", error);
      this.locationBuffer = [];
    }
  }

  public async getBufferedLocations(): Promise<Location.LocationObject[]> {
    return [...this.locationBuffer];
  }

  public async clearLocationBuffer(): Promise<void> {
    this.locationBuffer = [];
    try {
      await AsyncStorage.removeItem(LOCATION_BUFFER_KEY);
    } catch (error) {
      console.warn("Failed to clear location buffer:", error);
    }
  }

  // --- Foreground GPS ---
  async startForegroundTracking(): Promise<void> {
    if (this.locationSubscription) return;

    try {
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        this.handleLocationUpdate.bind(this),
      );

      // Start health monitoring
      this.startHealthCheck();

      console.log("Foreground GPS tracking started");
    } catch (error) {
      console.error("Failed to start foreground GPS tracking:", error);
      throw error;
    }
  }

  async stopForegroundTracking(): Promise<void> {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
      console.log("Foreground GPS tracking stopped");
    }

    // Stop health monitoring if no tracking is active
    if (!(await this.isTrackingBackground())) {
      this.stopHealthCheck();
    }
  }

  // --- Background GPS ---
  async startBackgroundTracking(sessionId?: string): Promise<void> {
    try {
      if (sessionId) {
        await AsyncStorage.setItem("background_location_session_id", sessionId);
      }

      await Location.startLocationUpdatesAsync(this.taskName, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: "GradientPeak Recording",
          notificationBody: "Recording your activity in the background",
          notificationColor: "#00ff00",
        },
      });

      // Start health monitoring
      this.startHealthCheck();

      console.log("Background location tracking started");
    } catch (error) {
      console.error("Failed to start background location:", error);
      throw error;
    }
  }

  async stopBackgroundTracking(): Promise<void> {
    try {
      const isStarted = await Location.hasStartedLocationUpdatesAsync(
        this.taskName,
      );
      if (isStarted) {
        await Location.stopLocationUpdatesAsync(this.taskName);
      }
      await AsyncStorage.removeItem("background_location_session_id");
      console.log("Background location tracking stopped");
    } catch (error) {
      // Ignore "task not found" errors as this happens during cleanup/restart

      if (
        (error as Error).message &&
        (error as Error).message.includes("Task") &&
        (error as Error).message.includes("not found")
      ) {
        console.log("Background location task already cleaned up");
        try {
          await AsyncStorage.removeItem("background_location_session_id");
        } catch (storageError) {
          console.warn("Failed to clean up session ID:", storageError);
        }
      } else {
        console.error("Failed to stop background location:", error);
        throw error;
      }
    }
  }

  // --- Health Monitoring ---

  private startHealthCheck(): void {
    if (this.healthCheckInterval !== null) return;

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL) as unknown as number;

    console.log("Location health monitoring started");
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log("Location health monitoring stopped");
    }
  }

  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    const timeSinceLastLocation = now - this.lastLocationTime;

    // If no location received in 30 seconds, try to restart
    if (timeSinceLastLocation > 30000) {
      console.warn(
        `No location updates for ${timeSinceLastLocation / 1000}s, attempting restart`,
      );

      try {
        // Try to restart foreground tracking
        if (this.locationSubscription) {
          await this.stopForegroundTracking();
          await this.startForegroundTracking();
        }

        // Check if background tracking is still active
        const isBackgroundActive = await this.isTrackingBackground();
        if (isBackgroundActive) {
          // Background restart is more complex, log the issue
          console.warn("Background location tracking may be stalled");
        }
      } catch (error) {
        console.error(
          "Failed to restart location tracking during health check:",
          error,
        );
      }
    }
  }

  // --- Convenience Methods ---
  async stopAllTracking(): Promise<void> {
    this.stopHealthCheck();
    // Stop tracking sequentially to avoid race conditions
    try {
      await this.stopForegroundTracking();
    } catch (error) {
      console.warn("Error stopping foreground tracking:", error);
    }
    try {
      await this.stopBackgroundTracking();
    } catch (error) {
      console.warn("Error stopping background tracking:", error);
    }
  }

  async cleanup(): Promise<void> {
    // Stop all tracking first
    await this.stopAllTracking();

    // Clear all callbacks
    this.clearAllCallbacks();

    // Unregister the TaskManager task
    try {
      await TaskManager.unregisterTaskAsync(this.taskName);
      console.log("Background location task unregistered");
    } catch (error) {
      // Ignore task not found errors during cleanup
      if (
        (error as Error).message &&
        (error as Error).message.includes("Task") &&
        (error as Error).message.includes("not found")
      ) {
        console.log("Background location task already unregistered");
      } else {
        console.warn("Error unregistering background location task:", error);
      }
    }
  }

  isTrackingForeground(): boolean {
    return this.locationSubscription !== null;
  }

  async isTrackingBackground(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(this.taskName);
    } catch (error) {
      // Task not found errors are expected during cleanup
      if (
        (error as Error).message &&
        (error as Error).message.includes("Task") &&
        (error as Error).message.includes("not found")
      ) {
        return false;
      }
      console.warn("Error checking background tracking status:", error);
      return false;
    }
  }

  /**
   * Check if location tracking is enabled (either foreground or background)
   */
  async isLocationEnabled(): Promise<boolean> {
    return this.isTrackingForeground() || (await this.isTrackingBackground());
  }

  // --- Subscription Management ---
  addCallback(callback: (location: Location.LocationObject) => void): void {
    this.locationCallbacks.add(callback);
    // Also add to background callback registry for background location updates
    backgroundLocationCallbacks.add(callback);
  }

  removeCallback(callback: (location: Location.LocationObject) => void): void {
    this.locationCallbacks.delete(callback);
    // Also remove from background callback registry
    backgroundLocationCallbacks.delete(callback);
  }

  clearAllCallbacks(): void {
    this.locationCallbacks.clear();
    // Also clear background callback registry
    backgroundLocationCallbacks.clear();
  }

  getCallbackCount(): number {
    return this.locationCallbacks.size;
  }
}
