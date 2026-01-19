import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME, THEME } from "@/lib/theme";
import { Tabs, useRouter } from "expo-router";
import { Book, Calendar, Circle, Home, Search } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

export default function InternalLayout() {
  const { theme } = useTheme();
  const router = useRouter();

  // Determine if we're in dark mode
  const isDark = theme === "dark";
  const navTheme = isDark ? NAV_THEME.dark : NAV_THEME.light;
  const currentTheme = isDark ? THEME.dark : THEME.light;

  return (
    <View className="flex-1 bg-background">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: navTheme.colors.primary,
          tabBarInactiveTintColor: currentTheme.mutedForeground,
          tabBarShowLabel: true,
          tabBarStyle: {
            height: 80,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <Icon as={Home} size={28} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: "Discover",
            tabBarIcon: ({ color }) => (
              <Icon as={Search} size={28} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="record-launcher"
          options={{
            title: "Record",
            tabBarIcon: ({ color }) => (
              <Icon as={Circle} size={28} color={color} />
            ),
            tabBarButton: (props) => (
              <TouchableOpacity
                {...(props as any)}
                onPress={() => router.push("/record")}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
            tabBarIcon: ({ color }) => (
              <Icon as={Calendar} size={28} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ color }) => (
              <Icon as={Book} size={28} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
