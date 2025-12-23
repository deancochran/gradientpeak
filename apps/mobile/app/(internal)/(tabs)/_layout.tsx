import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME, THEME } from "@/lib/theme";
import { Tabs } from "expo-router";
import {
  Calendar,
  Circle,
  Home,
  Settings,
  TrendingUp,
} from "lucide-react-native";
import React from "react";
import { View } from "react-native";

export default function InternalLayout() {
  const { theme } = useTheme();
  const { profile } = useRequireAuth();

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
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 80,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Icon as={Home} size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          tabBarIcon: ({ color }) => (
            <Icon as={Calendar} size={28} color={color} />
          ),
          title: "Plan",
        }}
      />
      <Tabs.Screen
        name="record-launcher"
        options={{
          title: "Record",
          tabBarIcon: ({ color }) => (
            <Icon as={Circle} size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          tabBarIcon: ({ color }) => (
            <Icon as={TrendingUp} size={28} color={color} />
          ),
          title: "Trends",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color, focused }) => {
            // Extract timestamp from avatar URL if it exists (added during upload)
            // This ensures React Native's image cache updates when avatar changes
            const avatarUri = profile?.avatar_url;

            return (
              <View className="items-center justify-center">
                <Avatar
                  alt={profile?.username || "User"}
                  className={`w-8 h-8 ${focused ? "border-2 border-primary" : "border-2 border-transparent"}`}
                >
                  {avatarUri ? (
                    <AvatarImage
                      source={{ uri: avatarUri }}
                      key={avatarUri} // Key changes when URL changes, forcing re-render
                    />
                  ) : null}
                  <AvatarFallback>
                    <Text className="text-sm">
                      {profile?.username?.charAt(0)?.toUpperCase() || "U"}
                    </Text>
                  </AvatarFallback>
                </Avatar>
              </View>
            );
          },
          title: "Settings",
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
