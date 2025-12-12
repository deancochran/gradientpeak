import { Stack } from "expo-router";

/**
 * Create Planned Activity Layout
 *
 * Stack-based navigation with proper headers and back navigation.
 * The screen can add header actions (Save/Submit) via navigation.setOptions.
 */
export default function CreatePlannedActivityLayout() {
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
          title: "Schedule Activity",
          // Individual screen can set headerRight via navigation.setOptions
        }}
      />
    </Stack>
  );
}
