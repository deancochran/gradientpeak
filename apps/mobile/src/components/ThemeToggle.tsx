// components/ui/ThemeToggle.tsx
import { ThemeOption, useColorScheme } from "@/app/_layout";
import React from "react";
import { Pressable, Text, View } from "react-native";

export function ThemeToggle() {
  const { userPreference, setThemePreference, colorScheme, isLoaded } =
    useColorScheme();

  if (!isLoaded) {
    return null;
  }

  return (
    <View className="flex-row items-center space-x-2">
      <Text className="text-gray-600 dark:text-gray-400">Theme:</Text>

      <View className="flex-row rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {(["light", "dark", "system"] as ThemeOption[]).map((theme) => (
          <Pressable
            key={theme}
            onPress={() => setThemePreference(theme)}
            className={`px-3 py-2 ${
              userPreference === theme
                ? "bg-blue-500"
                : "bg-white dark:bg-gray-800"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                userPreference === theme
                  ? "text-white"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {theme === "system"
                ? "Auto"
                : theme.charAt(0).toUpperCase() + theme.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function SimpleThemeToggle() {
  const { toggleColorScheme, isDarkColorScheme, isLoaded } = useColorScheme();

  if (!isLoaded) {
    return null;
  }

  return (
    <Pressable
      onPress={toggleColorScheme}
      className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 active:opacity-70"
    >
      <Text className="text-gray-800 dark:text-gray-200 text-lg">
        {isDarkColorScheme ? "☀️" : "🌙"}
      </Text>
    </Pressable>
  );
}
