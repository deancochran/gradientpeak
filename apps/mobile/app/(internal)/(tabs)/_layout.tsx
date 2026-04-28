import { Icon } from "@repo/ui/components/icon";
import { Tabs } from "expo-router";
import { Calendar, Circle, Home, Search, Target } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import {
  activitySelectionStore,
  defaultRecordLaunchPayload,
} from "@/lib/stores/activitySelectionStore";
import { useTheme } from "@/lib/stores/theme-store";
import { getNavigationTheme, getResolvedThemeScale } from "@/lib/theme";

export default function InternalLayout() {
  const { resolvedTheme } = useTheme();
  const guardNavigation = useNavigationActionGuard();
  const navigateTo = useAppNavigate();

  const navTheme = getNavigationTheme(resolvedTheme);
  const currentTheme = getResolvedThemeScale(resolvedTheme);

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
            backgroundColor: navTheme.colors.card,
            borderTopColor: navTheme.colors.border,
          },
          sceneStyle: {
            backgroundColor: navTheme.colors.background,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => <Icon as={Home} size={28} color={color} />,
            tabBarButtonTestID: "tab-button-home",
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: "Discover",
            tabBarIcon: ({ color }) => <Icon as={Search} size={28} color={color} />,
            tabBarButtonTestID: "tab-button-discover",
          }}
        />
        <Tabs.Screen
          name="record-launcher"
          options={{
            title: "Record",
            tabBarIcon: ({ color }) => <Icon as={Circle} size={28} color={color} />,
            tabBarButton: (props) => (
              <TouchableOpacity
                {...(props as any)}
                testID="tab-button-record"
                onPress={() =>
                  guardNavigation(() => {
                    activitySelectionStore.setSelection(defaultRecordLaunchPayload());
                    navigateTo("/record");
                  })
                }
              />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
            tabBarIcon: ({ color }) => <Icon as={Target} size={28} color={color} />,
            tabBarButtonTestID: "tab-button-plan",
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Calendar",
            tabBarIcon: ({ color }) => <Icon as={Calendar} size={28} color={color} />,
            tabBarButtonTestID: "tab-button-calendar",
          }}
        />
      </Tabs>
    </View>
  );
}
