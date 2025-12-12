import { Stack } from "expo-router";

/**
 * Training Plan Layout
 *
 * Stack-based navigation with proper headers, back navigation, and modal presentation.
 * The create screen uses modal presentation for a focused creation flow.
 */
export default function TrainingPlanLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Training Plan",
          headerShown: false, // Main index doesn't need header since it's accessible from tab
        }}
      />
      <Stack.Screen
        name="calendar"
        options={{
          title: "Calendar",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: "Settings",
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: "Create Training Plan",
          presentation: "modal",
          headerShown: true,
          // Modal with header allows for consistent navigation and optional header actions
        }}
      />
    </Stack>
  );
}
