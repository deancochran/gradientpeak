// services/locationManager.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const BACKGROUND_LOCATION_TASK = "background-location-task";

export class LocationManager {
  private locationSubscription: Location.LocationSubscription | null = null;
  private locationCallbacks = new Set<
    (location: Location.LocationObject) => void
  >();
  private taskName: string;

  constructor(taskName: string = BACKGROUND_LOCATION_TASK) {
    this.taskName = taskName;
    this.defineBackgroundTask();
  }

  private defineBackgroundTask() {
    TaskManager.defineTask(this.taskName, async ({ data, error }) => {
      if (error) {
        console.error("Background location task error:", error);
        return;
      }
      if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        locations.forEach(this.handleLocationUpdate.bind(this));
      }
      return;
    });
  }

  private handleLocationUpdate(location: Location.LocationObject) {
    this.locationCallbacks.forEach((cb) => {
      try {
        cb(location);
      } catch (e) {
        console.warn("Error in location callback:", e);
      }
    });
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
          notificationTitle: "TurboFit Recording",
          notificationBody: "Recording your activity in the background",
          notificationColor: "#00ff00",
        },
      });
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
      console.error("Failed to stop background location:", error);
      throw error;
    }
  }

  // --- Convenience Methods ---
  async stopAllTracking(): Promise<void> {
    await Promise.all([
      this.stopForegroundTracking(),
      this.stopBackgroundTracking(),
    ]);
  }

  isTrackingForeground(): boolean {
    return this.locationSubscription !== null;
  }

  async isTrackingBackground(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(this.taskName);
    } catch {
      return false;
    }
  }

  // --- Subscription Management ---
  addCallback(callback: (location: Location.LocationObject) => void): void {
    this.locationCallbacks.add(callback);
  }

  removeCallback(callback: (location: Location.LocationObject) => void): void {
    this.locationCallbacks.delete(callback);
  }

  clearAllCallbacks(): void {
    this.locationCallbacks.clear();
  }

  getCallbackCount(): number {
    return this.locationCallbacks.size;
  }
}
