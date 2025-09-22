import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME, THEME } from "@/lib/theme";
import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";

export default function InternalLayout() {
  const { theme } = useTheme();

  // Determine if we're in dark mode
  const isDark = theme === "dark";
  const navTheme = isDark ? NAV_THEME.dark : NAV_THEME.light;
  const currentTheme = isDark ? THEME.dark : THEME.light;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: navTheme.colors.primary,
          tabBarInactiveTintColor: currentTheme.mutedForeground,
          tabBarLabelStyle: {
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
          }}
        />
        <Tabs.Screen
          name="record"
          options={{
            title: "Record",
          }}
        />
        <Tabs.Screen
          name="trends"
          options={{
            title: "Trends",
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
          }}
        />
      </Tabs>
    </View>
  );
}
