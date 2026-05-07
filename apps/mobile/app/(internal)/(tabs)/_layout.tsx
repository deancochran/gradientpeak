import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Tabs } from "expo-router";
import { BarChart3, CalendarDays, Circle, Home } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { useRecordingLifecycle } from "@/lib/hooks/useActivityRecorder";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  activitySelectionStore,
  defaultRecordLaunchPayload,
} from "@/lib/stores/activitySelectionStore";
import { useTheme } from "@/lib/stores/theme-store";
import { getNavigationTheme, getResolvedThemeScale } from "@/lib/theme";

function ProfileTabIcon({ color }: { color: string }) {
  const { user, profile } = useAuth();
  const avatarUri = profile?.avatar_url;
  const fallback =
    profile?.username?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "A";

  return (
    <Avatar alt={profile?.username || "User profile"} className="h-7 w-7 border border-border">
      {avatarUri ? <AvatarImage source={{ uri: avatarUri }} key={avatarUri} /> : null}
      <AvatarFallback>
        <Text className="text-xs font-semibold" style={{ color }}>
          {fallback}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}

export default function InternalLayout() {
  const { resolvedTheme } = useTheme();
  const guardNavigation = useNavigationActionGuard();
  const navigateTo = useAppNavigate();
  const recorderService = useSharedActivityRecorder();
  const recordingLifecycle = useRecordingLifecycle(recorderService);

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
        <Tabs.Screen name="discover" options={{ href: null }} />
        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
            tabBarIcon: ({ color }) => <Icon as={CalendarDays} size={28} color={color} />,
            tabBarButtonTestID: "tab-button-plan",
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
                    if (recordingLifecycle === "idle") {
                      activitySelectionStore.setSelection(defaultRecordLaunchPayload());
                    }
                    navigateTo("/record");
                  })
                }
              />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="trends"
          options={{
            title: "Trends",
            tabBarIcon: ({ color }) => <Icon as={BarChart3} size={28} color={color} />,
            tabBarButtonTestID: "tab-button-trends",
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => <ProfileTabIcon color={color} />,
            tabBarButtonTestID: "tab-button-profile",
          }}
        />
      </Tabs>
    </View>
  );
}
