import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME, THEME } from "@/lib/theme";
import { Tabs } from "expo-router";
import { Circle, Home } from "lucide-react-native";
import React from "react";

export default function InternalLayout() {
  const { theme } = useTheme();

  // Determine if we're in dark mode
  const isDark = theme === "dark";
  const navTheme = isDark ? NAV_THEME.dark : NAV_THEME.light;
  const currentTheme = isDark ? THEME.dark : THEME.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: navTheme.colors.primary,
        tabBarInactiveTintColor: currentTheme.mutedForeground,
        tabBarLabelStyle: {
          fontSize: 11,
          overflow: "visible",
        },
        tabBarStyle: {
          height: 60,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Icon as={Home} size={24} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          tabBarIcon: ({ color }) => <Icon as={Home} size={24} />,
          title: "Plan",
        }}
      />
      <Tabs.Screen
        name="record-launcher"
        options={{
          title: "Record",
          tabBarIcon: ({ color }) => <Icon as={Circle} size={24} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          tabBarIcon: ({ color }) => <Icon as={Home} size={24} />,
          title: "Trends",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => <Icon as={Home} size={24} />,
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
