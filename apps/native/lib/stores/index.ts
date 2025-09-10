// Auth Store
export {
  useAuth,
  useAuthStore,
  useIsAuthenticated,
  useSession,
  useUser,
  type AuthState,
} from "./auth-store";

// Workout Store
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
} from "./workout-store";

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

    // Recover any active workout session
    const { useWorkoutStore } = await import("./workout-store");
    const workoutStore = useWorkoutStore.getState();
    await workoutStore.recoverWorkout();
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

  // Clear any temporary workout data
  const { useWorkoutStore } = await import("./workout-store");
  useWorkoutStore.getState().clearActiveWorkout();
};
