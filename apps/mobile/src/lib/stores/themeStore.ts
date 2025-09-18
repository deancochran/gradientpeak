// stores/themeStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme } from "nativewind";
import { create } from "zustand";

const THEME_STORAGE_KEY = "@theme_preference";

type ThemePreference = "system" | "light" | "dark";

interface ThemeStore {
  userPreference: ThemePreference;
  isLoaded: boolean;
  initialize: () => Promise<void>;
  setTheme: (preference: ThemePreference) => Promise<void>;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  // State
  userPreference: "system",
  isLoaded: false,

  // Actions
  initialize: async () => {
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
}));

// Simple hook for components
export const useTheme = () => {
  const { userPreference, isLoaded, setTheme, toggleTheme, initialize } =
    useThemeStore();

  return {
    theme: userPreference,
    isLoaded,
    setTheme,
    toggleTheme,
    initialize,
  };
};

// Initialize function
export const initializeTheme = () => {
  useThemeStore.getState().initialize();
};

// Export the type for use in components if needed
export type { ThemePreference };
