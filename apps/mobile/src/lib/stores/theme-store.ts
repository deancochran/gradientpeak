// stores/theme-store.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme } from "nativewind";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const THEME_STORAGE_KEY = "@theme_preference";

type ThemePreference = "system" | "light" | "dark";

interface ThemeStore {
  userPreference: ThemePreference;
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
      userPreference: "system" as ThemePreference,
      isLoaded: false as boolean,
      hydrated: false as boolean,

      // Actions
      setHydrated: (hydrated: boolean) => set({ hydrated }),

      initialize: async () => {
        if (get().isLoaded) return;

        try {
          const savedPreference = await AsyncStorage.getItem(THEME_STORAGE_KEY);

          if (
            savedPreference &&
            ["light", "dark", "system"].includes(savedPreference)
          ) {
            const preference = savedPreference as ThemePreference;
            set({ userPreference: preference });
            colorScheme.set(preference);
          } else {
            // Default to system preference
            colorScheme.set("system");
          }
        } catch (error) {
          console.warn("Failed to load theme preference:", error);
          colorScheme.set("system");
        } finally {
          set({ isLoaded: true });
        }
      },

      setTheme: async (preference: ThemePreference) => {
        try {
          await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
          set({ userPreference: preference });
          colorScheme.set(preference);
        } catch (error) {
          console.warn("Failed to save theme preference:", error);
        }
      },

      toggleTheme: () => {
        const { userPreference } = get();
        const newTheme: ThemePreference =
          userPreference === "dark" ? "light" : "dark";
        get().setTheme(newTheme);
      },
    }),
    {
      name: "turbofit-theme-store",
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

// Simple hook for components
export const useTheme = () => {
  const {
    userPreference,
    isLoaded,
    hydrated,
    setTheme,
    toggleTheme,
    initialize,
  } = useThemeStore();

  // Auto-initialize if hydrated but not loaded
  if (hydrated && !isLoaded) {
    initialize();
  }

  return {
    theme: userPreference,
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
