import { Icon } from "@repo/ui/components/icon";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "expo-router/js-tabs";
import { Circle, Home, Route, Search, Users } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import { TrainingPreferencesEditor } from "@/components/settings/training-preferences/TrainingPreferencesEditor";
import { useSessionView } from "@/lib/hooks/useActivityRecorder";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { markNavigationStart } from "@/lib/performance";
import { useActivityRecorderService } from "@/lib/providers/ActivityRecorderProvider";
import {
  activitySelectionStore,
  defaultRecordLaunchPayload,
} from "@/lib/stores/activitySelectionStore";
import { useTheme } from "@/lib/stores/theme-store";
import { useTrainingPreferencesSheetStore } from "@/lib/stores/trainingPreferencesSheetStore";
import { getNavigationTheme, getResolvedThemeScale } from "@/lib/theme";

function MeasuredTabButton({
  routeKey,
  testID,
  ...props
}: BottomTabBarButtonProps & { routeKey: string; testID: string }) {
  return (
    <TouchableOpacity
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole={props.accessibilityRole}
      accessibilityState={props.accessibilityState}
      disabled={props.disabled ?? undefined}
      onLongPress={props.onLongPress ?? undefined}
      style={props.style}
      testID={testID}
      onPress={(event) => {
        markNavigationStart(routeKey);
        props.onPress?.(event);
      }}
    >
      {props.children}
    </TouchableOpacity>
  );
}

export default function InternalLayout() {
  const { resolvedTheme } = useTheme();
  const guardNavigation = useNavigationActionGuard();
  const navigateTo = useAppNavigate();
  const { service: recorderService } = useActivityRecorderService();
  const recordingLifecycle = useSessionView(recorderService)?.lifecycle ?? "idle";
  const trainingPreferencesVisible = useTrainingPreferencesSheetStore((state) => state.visible);
  const closeTrainingPreferences = useTrainingPreferencesSheetStore((state) => state.close);

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
            tabBarButton: (props) => (
              <MeasuredTabButton {...props} routeKey="route-home" testID="tab-button-home" />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
            tabBarIcon: ({ color }) => <Icon as={Route} size={28} color={color} />,
            tabBarButton: (props) => (
              <MeasuredTabButton {...props} routeKey="route-plan" testID="tab-button-plan" />
            ),
          }}
        />
        <Tabs.Screen
          name="record-launcher"
          options={{
            title: "Record",
            tabBarIcon: ({ color }) => <Icon as={Circle} size={28} color={color} />,
            tabBarButton: (props) => (
              <TouchableOpacity
                accessibilityLabel={props.accessibilityLabel}
                accessibilityRole={props.accessibilityRole}
                accessibilityState={props.accessibilityState}
                disabled={props.disabled ?? undefined}
                onLongPress={props.onLongPress ?? undefined}
                style={props.style}
                testID="tab-button-record"
                onPress={() =>
                  guardNavigation(() => {
                    markNavigationStart("route-record");
                    if (recordingLifecycle === "idle") {
                      activitySelectionStore.setSelection(defaultRecordLaunchPayload());
                    }
                    navigateTo("/record");
                  })
                }
              >
                {props.children}
              </TouchableOpacity>
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: "Discover",
            tabBarIcon: ({ color }) => <Icon as={Search} size={28} color={color} />,
            tabBarButton: (props) => (
              <MeasuredTabButton
                {...props}
                routeKey="route-discover"
                testID="tab-button-discover"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: "Community",
            tabBarIcon: ({ color }) => <Icon as={Users} size={28} color={color} />,
            tabBarButton: (props) => (
              <MeasuredTabButton
                {...props}
                routeKey="route-community"
                testID="tab-button-community"
              />
            ),
          }}
        />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>
      {trainingPreferencesVisible ? (
        <TrainingPreferencesEditor
          visible={trainingPreferencesVisible}
          showLauncher={false}
          onClose={closeTrainingPreferences}
        />
      ) : null}
    </View>
  );
}
