// Permissions Store
export {
  PermissionState,
  usePermissionsStore,
  type PermissionsStatus,
} from "./permissions-store";

// Activity Store
export {
  useActiveWorkout,
  useHasActiveSession,
  useIsRecording,
  useWorkoutMetrics,
  useWorkoutSettings,
  useWorkoutStore,
  type ActiveWorkout,
  type WorkoutMetrics,
  type WorkoutSettings,
  type WorkoutState,
  type WorkoutStatus,
  type WorkoutType,
} from "./activity-store";

// Activity Data Store
export {
  useActivities,
  useActivitiesError,
  useActivitiesLoading,
  useActivityDataStore,
  useCurrentFitness,
  useCurrentForm,
  useGetActivitiesForPeriod,
  useGetTSSHistoryForPeriod,
  useLoadActivities,
  useLoadPerformanceMetrics,
  usePerformanceMetrics,
  usePerformanceMetricsError,
  usePerformanceMetricsLoading,
  useRecentActivities,
  useRefreshAllData,
  useSyncStatus,
  useTrainingLoadAnalysis,
  useTSSHistory,
  useWeeklyTSS,
  type ActivityDataState,
} from "./activity-data-store";

// Store initialization utilities
let _storesInitialized = false;

export const initializeStores = async () => {
  if (_storesInitialized) {
    return;
  }
  _storesInitialized = true;

  try {
    // Recover any active activity session
    const { useWorkoutStore } = await import("./activity-store");
    const workoutStore = useWorkoutStore.getState();
    await workoutStore.recoverWorkout();

    // Initialize activity data store
    const { useActivityDataStore } = await import("./activity-data-store");
    const activityStore = useActivityDataStore.getState();
    // Activity store will be loaded when profile is available
  } catch (error) {
    _storesInitialized = false; // Reset on error so retry is possible
    throw error;
  }
};

// Store cleanup utilities
export const cleanupStores = async () => {
  // Clear any temporary activity data
  const { useWorkoutStore } = await import("./activity-store");
  useWorkoutStore.getState().clearActiveWorkout();

  // Reset activity data store
  const { useActivityDataStore } = await import("./activity-data-store");
  useActivityDataStore.getState().resetStore();

  // Note: Theme store doesn't need cleanup as user preference should persist
  // Note: Auth store doesn't need cleanup as auth store should persist
};
