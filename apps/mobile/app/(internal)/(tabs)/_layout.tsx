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
          tabBarIcon: ({ color }) => <Icon as={Calendar} size={24} />,
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
          tabBarIcon: ({ color }) => <Icon as={TrendingUp} size={24} />,
          title: "Trends",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => (
            <>
              {profile?.avatar_url ? (
                <Avatar
                  alt="profile"
                  className="border-background web:border-0 web:ring-2 web:ring-background border-2"
                >
                  <AvatarImage source={{ uri: profile?.avatar_url }} />
                  <AvatarFallback>
                    <Text>ZN</Text>
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Icon as={Settings} size={24} />
              )}
            </>
          ),
          title: "Settings",
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
