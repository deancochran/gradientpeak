import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type ResolvedThemeMode, resolveThemeMode, type ThemePreference } from "@/lib/theme";

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
          Appearance.setColorScheme(preference === "system" ? null : preference);
        } catch (error) {
          console.warn("Failed to initialize theme:", error);
          set({
            userPreference: "system",
            resolvedTheme: resolveThemeMode("system"),
          });
          Appearance.setColorScheme(null);
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
          Appearance.setColorScheme(preference === "system" ? null : preference);
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
          Appearance.setColorScheme(null);
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
