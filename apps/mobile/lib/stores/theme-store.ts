// stores/theme-store.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type ResolvedThemeMode, resolveThemeMode, type ThemePreference } from "@/lib/theme";

const THEME_STORAGE_KEY = "@theme_preference";

interface ThemeStore {
  userPreference: ThemePreference;
  resolvedTheme: ResolvedThemeMode;
  isLoaded: boolean;
  hydrated: boolean;
  initialize: () => Promise<void>;
  setTheme: (preference: ThemePreference) => Promise<void>;
  toggleTheme: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      // State
      userPreference: "light" as ThemePreference,
      resolvedTheme: "light" as ResolvedThemeMode,
      isLoaded: false as boolean,
      hydrated: false as boolean,

      // Actions
      setHydrated: (hydrated: boolean) => set({ hydrated }),

      initialize: async () => {
        if (get().isLoaded) return;

        try {
          const savedPreference = await AsyncStorage.getItem(THEME_STORAGE_KEY);

          if (savedPreference && ["light", "dark", "system"].includes(savedPreference)) {
            const preference = savedPreference as ThemePreference;
            set({
              userPreference: preference,
              resolvedTheme: resolveThemeMode(preference),
            });
            Appearance.setColorScheme(preference === "system" ? null : preference);
          } else {
            // Default to light mode
            const defaultTheme = "light";
            set({
              userPreference: defaultTheme,
              resolvedTheme: resolveThemeMode(defaultTheme),
            });
            Appearance.setColorScheme(defaultTheme);
            await AsyncStorage.setItem(THEME_STORAGE_KEY, defaultTheme);
          }
        } catch (error) {
          console.warn("Failed to load theme preference:", error);
          set({
            userPreference: "light",
            resolvedTheme: resolveThemeMode("light"),
          });
          Appearance.setColorScheme("light");
        } finally {
          set({ isLoaded: true });
        }
      },

      setTheme: async (preference: ThemePreference) => {
        try {
          await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
          set({
            userPreference: preference,
            resolvedTheme: resolveThemeMode(preference),
          });
          Appearance.setColorScheme(preference === "system" ? null : preference);
        } catch (error) {
          console.warn("Failed to save theme preference:", error);
        }
      },

      toggleTheme: () => {
        const { resolvedTheme } = get();
        const newTheme: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
        get().setTheme(newTheme);
      },
    }),
    {
      name: "gradientpeak-theme-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userPreference: state.userPreference,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          state.setHydrated(true);
          state.initialize();
        } else if (error && state) {
          console.warn("Theme Store rehydrate error:", error);
          state.setHydrated(true);
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
  const { userPreference, resolvedTheme, isLoaded, hydrated, setTheme, toggleTheme, initialize } =
    useThemeStore();

  // Auto-initialize if hydrated but not loaded
  if (hydrated && !isLoaded) {
    initialize();
  }

  return {
    theme: userPreference,
    resolvedTheme,
    isLoaded,
    hydrated,
    setTheme,
    toggleTheme,
  };
};

// Initialize function
export const initializeTheme = () => {
  useThemeStore.getState().initialize();
};

// Export the type for use in components if needed
export type { ThemePreference };
