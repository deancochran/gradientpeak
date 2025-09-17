// Auth Store
export {
  useAuth,
  useAuthStore,
  useIsAuthenticated,
  useSession,
  useUser,
  type AuthState,
} from "./auth-store";

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

// Settings Store
export {
  useDataSettings,
  useDisplaySettings,
  useIsFirstLaunch,
  useLanguage,
  useNotificationSettings,
  useOnboardingCompleted,
  usePrivacySettings,
  useSettingsStore,
  useTheme,
  useUnits,
  useWorkoutPreferences,
  type DataSettings,
  type DisplaySettings,
  type Language,
  type NotificationFrequency,
  type NotificationSettings,
  type PrivacySettings,
  type SettingsState,
  type Theme,
  type Units,
  type WorkoutPreferences,
} from "./settings-store";

// UI Store
export {
  useActiveBottomSheet,
  useActiveModal,
  useActiveTab,
  useAlerts,
  useIsDrawerOpen,
  useKeyboardState,
  useLoading,
  useModalData,
  useOrientation,
  useRefreshing,
  useSearchState,
  useUIStore,
  type Alert,
  type AlertType,
  type BottomSheet,
  type LoadingState,
  type ModalType,
  type TabType,
  type UIState,
} from "./ui-store";

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
    // Initialize auth store
    const { useAuthStore } = await import("./auth-store");
    const authStore = useAuthStore.getState();
    await authStore.initialize();

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
  // Reset UI state
  const { useUIStore } = await import("./ui-store");
  useUIStore.getState().resetUIState();

  // Clear any temporary activity data
  const { useWorkoutStore } = await import("./activity-store");
  useWorkoutStore.getState().clearActiveWorkout();

  // Reset activity data store
  const { useActivityDataStore } = await import("./activity-data-store");
  useActivityDataStore.getState().resetStore();
};
