import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { colorScheme as nativeCssColorScheme } from "react-native-css/native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type ResolvedThemeMode, resolveThemeMode, type ThemePreference } from "@/lib/theme";

function applyRuntimeTheme(preference: ThemePreference) {
  const scheme = preference === "system" ? null : preference;

  nativeCssColorScheme.set(scheme);
  Appearance.setColorScheme(scheme);
}

interface ThemeStore {
  userPreference: ThemePreference;
  resolvedTheme: ResolvedThemeMode;
  isLoaded: boolean;
  initialize: () => Promise<void>;
  setTheme: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      // State
      userPreference: "system" as ThemePreference,
      resolvedTheme: resolveThemeMode("system") as ResolvedThemeMode,
      isLoaded: false as boolean,

      initialize: async () => {
        if (get().isLoaded) return;

        const preference = get().userPreference;

        try {
          set({
            resolvedTheme: resolveThemeMode(preference),
          });
          applyRuntimeTheme(preference);
        } catch (error) {
          console.warn("Failed to initialize theme:", error);
          set({
            userPreference: "system",
            resolvedTheme: resolveThemeMode("system"),
          });
          applyRuntimeTheme("system");
        } finally {
          set({ isLoaded: true });
        }
      },

      setTheme: (preference: ThemePreference) => {
        try {
          set({
            userPreference: preference,
            resolvedTheme: resolveThemeMode(preference),
          });
          applyRuntimeTheme(preference);
        } catch (error) {
          console.warn("Failed to update theme:", error);
        }
      },
    }),
    {
      name: "gradientpeak-theme-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userPreference: state.userPreference,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          void useThemeStore.getState().initialize();
        } else {
          console.warn("Theme Store rehydrate error:", error);
          useThemeStore.setState({
            userPreference: "system",
            resolvedTheme: resolveThemeMode("system"),
            isLoaded: true,
          });
          applyRuntimeTheme("system");
        }
      },
    },
  ),
);

Appearance.addChangeListener(({ colorScheme }) => {
  const { userPreference } = useThemeStore.getState();

  if (userPreference !== "system") {
    return;
  }

  useThemeStore.setState({
    resolvedTheme: resolveThemeMode(userPreference, colorScheme),
  });
});

// Simple hook for components
export const useTheme = () => {
  const { userPreference, resolvedTheme, isLoaded, setTheme } = useThemeStore();

  return {
    theme: userPreference,
    resolvedTheme,
    isLoaded,
    setTheme,
  };
};

// Export the type for use in components if needed
export type { ThemePreference };
