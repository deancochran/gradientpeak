import { database } from "@/db";
import Activity from "@/db/models/Activity";
import LocationPoint from "@/db/models/LocationPoint";
import { Q } from "@nozbe/watermelondb";

// Re-defining this type here to avoid circular dependencies with the component file
// In a larger app, this might live in a central types directory.
interface GpsLocation {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp: number;
  speed?: number | null;
  accuracy?: number | null;
}

class WorkoutService {
  /**
   * Creates a new activity record in the database.
   * This should be called when the user starts a new workout.
   */
  async createWorkout(profileId: string): Promise<Activity> {
    return await database.write(async () => {
      const newActivity = await database
        .get<Activity>("activities")
        .create((activity) => {
          activity.profileId = profileId;
          activity.startedAt = new Date();
          activity.syncStatus = "local_only";
        });
      return newActivity;
    });
  }

  /**
   * Adds a new GPS location point to an existing activity.
   * This will be called from both the foreground and background location trackers.
   */
  async addLocationPoint(
    activityId: string,
    location: GpsLocation,
  ): Promise<void> {
    await database.write(async () => {
      await database.get<LocationPoint>("location_points").create((point) => {
        point.activity.id = activityId;
        point.latitude = location.latitude;
        point.longitude = location.longitude;
        point.altitude = location.altitude ?? undefined;
        point.timestamp = new Date(location.timestamp);
        point.speed = location.speed ?? undefined;
        point.accuracy = location.accuracy ?? undefined;
      });
    });
  }

  /**
   * Updates a finished activity with final summary data.
   * This is called when the user stops the workout.
   */
  async finishWorkout(
    activityId: string,
    distance: number,
    duration: number,
  ): Promise<void> {
    await database.write(async () => {
      const activity = await database
        .get<Activity>("activities")
        .find(activityId);
      await activity.update((rec) => {
        rec.endedAt = new Date();
        rec.distance = distance;
        rec.duration = duration;
      });
    });
  }

  /**
   * Finds an activity that was started but never finished.
   * This will be used for workout recovery (Phase 3).
   */
  async getUnfinishedWorkout(): Promise<Activity | null> {
    const unfinished = await database
      .get<Activity>("activities")
      .query(
        Q.where("ended_at", null),
        Q.sortBy("started_at", Q.desc),
        Q.take(1),
      )
      .fetch();

    return unfinished.length > 0 ? unfinished[0] : null;
  }

  /**
   * Deletes a workout and all its associated location points.
   * Useful for discarding a workout.
   */
  async deleteWorkout(activityId: string): Promise<void> {
    await database.write(async () => {
      const activity = await database
        .get<Activity>("activities")
        .find(activityId);
      await activity.destroyPermanently(); // This will also delete all related location_points
    });
  }

  /**
   * Retrieves all location points for a given workout.
   */
  async getWorkoutLocationPoints(activityId: string): Promise<LocationPoint[]> {
    const activity = await database
      .get<Activity>("activities")
      .find(activityId);
    return await activity.locationPoints.fetch();
  }
}

// Export a singleton instance of the service
export const workoutService = new WorkoutService();
