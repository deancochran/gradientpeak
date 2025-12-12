import { Stack } from "expo-router";

/**
 * Create Activity Plan Layout
 *
 * Stack-based navigation with proper headers and back navigation.
 * Forms can add header actions (Save/Submit) via navigation.setOptions in their screens.
 */
export default function CreateActivityPlanLayout() {
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
          title: "Create Activity Plan",
          // Individual screen can set headerRight via navigation.setOptions
        }}
      />
      <Stack.Screen
        name="structure/index"
        options={{
          title: "Edit Structure",
          // Individual screen can set headerRight via navigation.setOptions
        }}
      />
      <Stack.Screen
        name="structure/repeat/index"
        options={{
          title: "Edit Repeat",
          // Individual screen can set headerRight via navigation.setOptions
        }}
      />
    </Stack>
  );
}
