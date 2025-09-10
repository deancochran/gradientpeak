import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Units = "metric" | "imperial";
export type Language = "en" | "es" | "fr" | "de" | "it" | "pt" | "ja" | "zh";
export type Theme = "light" | "dark" | "auto";
export type NotificationFrequency = "none" | "daily" | "weekly" | "monthly";

export interface NotificationSettings {
  workoutReminders: boolean;
  progressUpdates: boolean;
  achievementAlerts: boolean;
  socialUpdates: boolean;
  frequency: NotificationFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:MM format
  quietHoursEnd: string; // HH:MM format
}

export interface PrivacySettings {
  shareActivities: boolean;
  shareLocation: boolean;
  shareMetrics: boolean;
  allowAnalytics: boolean;
  allowCrashReporting: boolean;
}

export interface WorkoutPreferences {
  defaultWorkoutType: string;
  autoStart: boolean;
  autoPause: boolean;
  autoLap: boolean;
  autoLapDistance: number; // in meters
  countdownTimer: number; // in seconds
  enableVoiceGuidance: boolean;
  voiceGuidanceInterval: number; // in seconds
  enableHapticFeedback: boolean;
  screenAlwaysOn: boolean;
}

export interface DisplaySettings {
  theme: Theme;
  units: Units;
  language: Language;
  showTabLabels: boolean;
  compactMode: boolean;
  highContrast: boolean;
  fontSize: "small" | "medium" | "large" | "extra-large";
}

export interface DataSettings {
  syncFrequency: "manual" | "hourly" | "daily" | "real-time";
  wifiOnlySync: boolean;
  autoBackup: boolean;
  dataRetention: number; // in days
  exportFormat: "fit" | "gpx" | "tcx" | "csv";
}

export interface SettingsState {
  // Settings categories
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  workout: WorkoutPreferences;
  display: DisplaySettings;
  data: DataSettings;

  // App state
  isFirstLaunch: boolean;
  onboardingCompleted: boolean;
  lastSyncTime: Date | null;

  // Actions
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  updatePrivacySettings: (settings: Partial<PrivacySettings>) => void;
  updateWorkoutPreferences: (settings: Partial<WorkoutPreferences>) => void;
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  updateDataSettings: (settings: Partial<DataSettings>) => void;
  setFirstLaunch: (isFirst: boolean) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setLastSyncTime: (time: Date) => void;
  resetToDefaults: () => void;
  exportSettings: () => string;
  importSettings: (settingsJson: string) => Promise<boolean>;
}

const defaultNotificationSettings: NotificationSettings = {
  workoutReminders: true,
  progressUpdates: true,
  achievementAlerts: true,
  socialUpdates: false,
  frequency: "weekly",
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

const defaultPrivacySettings: PrivacySettings = {
  shareActivities: false,
  shareLocation: false,
  shareMetrics: false,
  allowAnalytics: true,
  allowCrashReporting: true,
};

const defaultWorkoutPreferences: WorkoutPreferences = {
  defaultWorkoutType: "running",
  autoStart: false,
  autoPause: true,
  autoLap: false,
  autoLapDistance: 1000, // 1km
  countdownTimer: 3,
  enableVoiceGuidance: true,
  voiceGuidanceInterval: 60, // every minute
  enableHapticFeedback: true,
  screenAlwaysOn: true,
};

const defaultDisplaySettings: DisplaySettings = {
  theme: "auto",
  units: "metric",
  language: "en",
  showTabLabels: true,
  compactMode: false,
  highContrast: false,
  fontSize: "medium",
};

const defaultDataSettings: DataSettings = {
  syncFrequency: "hourly",
  wifiOnlySync: false,
  autoBackup: true,
  dataRetention: 365, // 1 year
  exportFormat: "fit",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial state
      notifications: defaultNotificationSettings,
      privacy: defaultPrivacySettings,
      workout: defaultWorkoutPreferences,
      display: defaultDisplaySettings,
      data: defaultDataSettings,
      isFirstLaunch: true,
      onboardingCompleted: false,
      lastSyncTime: null,

      // Actions
      updateNotificationSettings: (settings) => {
        set((state) => ({
          notifications: { ...state.notifications, ...settings },
        }));
        console.log(
          "📳 Settings Store: Updated notification settings",
          settings,
        );
      },

      updatePrivacySettings: (settings) => {
        set((state) => ({
          privacy: { ...state.privacy, ...settings },
        }));
        console.log("🔒 Settings Store: Updated privacy settings", settings);
      },

      updateWorkoutPreferences: (settings) => {
        set((state) => ({
          workout: { ...state.workout, ...settings },
        }));
        console.log("🏃 Settings Store: Updated workout preferences", settings);
      },

      updateDisplaySettings: (settings) => {
        set((state) => ({
          display: { ...state.display, ...settings },
        }));
        console.log("🎨 Settings Store: Updated display settings", settings);
      },

      updateDataSettings: (settings) => {
        set((state) => ({
          data: { ...state.data, ...settings },
        }));
        console.log("💾 Settings Store: Updated data settings", settings);
      },

      setFirstLaunch: (isFirst) => {
        set({ isFirstLaunch: isFirst });
        console.log("🚀 Settings Store: Set first launch", isFirst);
      },

      setOnboardingCompleted: (completed) => {
        set({ onboardingCompleted: completed });
        console.log("✅ Settings Store: Set onboarding completed", completed);
      },

      setLastSyncTime: (time) => {
        set({ lastSyncTime: time });
        console.log("🔄 Settings Store: Set last sync time", time);
      },

      resetToDefaults: () => {
        set({
          notifications: defaultNotificationSettings,
          privacy: defaultPrivacySettings,
          workout: defaultWorkoutPreferences,
          display: defaultDisplaySettings,
          data: defaultDataSettings,
        });
        console.log("🔄 Settings Store: Reset to defaults");
      },

      exportSettings: () => {
        const state = get();
        const exportData = {
          notifications: state.notifications,
          privacy: state.privacy,
          workout: state.workout,
          display: state.display,
          data: state.data,
          exportedAt: new Date().toISOString(),
          version: "1.0",
        };
        return JSON.stringify(exportData, null, 2);
      },

      importSettings: async (settingsJson: string) => {
        try {
          const importedData = JSON.parse(settingsJson);

          // Validate the imported data structure
          if (!importedData || typeof importedData !== "object") {
            throw new Error("Invalid settings format");
          }

          // Merge with existing settings, keeping defaults for missing values
          const state = get();
          set({
            notifications: {
              ...state.notifications,
              ...importedData.notifications,
            },
            privacy: { ...state.privacy, ...importedData.privacy },
            workout: { ...state.workout, ...importedData.workout },
            display: { ...state.display, ...importedData.display },
            data: { ...state.data, ...importedData.data },
          });

          console.log("📥 Settings Store: Successfully imported settings");
          return true;
        } catch (error) {
          console.error("❌ Settings Store: Failed to import settings:", error);
          return false;
        }
      },
    }),
    {
      name: "turbofit-settings-store",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Migrate settings if needed in future versions
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // Migration logic for version 0 to 1
          return {
            ...(persistedState as Record<string, unknown>),
            // Add any new fields or transform existing ones
          };
        }
        return persistedState;
      },
    },
  ),
);

// Convenience hooks
export const useNotificationSettings = () =>
  useSettingsStore((state) => state.notifications);
export const usePrivacySettings = () =>
  useSettingsStore((state) => state.privacy);
export const useWorkoutPreferences = () =>
  useSettingsStore((state) => state.workout);
export const useDisplaySettings = () =>
  useSettingsStore((state) => state.display);
export const useDataSettings = () => useSettingsStore((state) => state.data);
export const useTheme = () => useSettingsStore((state) => state.display.theme);
export const useUnits = () => useSettingsStore((state) => state.display.units);
export const useLanguage = () =>
  useSettingsStore((state) => state.display.language);
export const useIsFirstLaunch = () =>
  useSettingsStore((state) => state.isFirstLaunch);
export const useOnboardingCompleted = () =>
  useSettingsStore((state) => state.onboardingCompleted);
