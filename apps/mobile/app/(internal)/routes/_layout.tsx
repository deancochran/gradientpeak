import { Stack } from "expo-router";

/**
 * Routes Layout
 *
 * Stack-based navigation with proper headers and back navigation.
 * Upload screen uses modal presentation for focused file upload flow.
 */
export default function RoutesLayout() {
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
          title: "Routes",
        }}
      />
      <Stack.Screen
        name="upload"
        options={{
          title: "Upload Route",
          presentation: "modal",
          // Modal with header for consistent navigation
          // Screen can add headerRight for submit action
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Route Details",
        }}
      />
    </Stack>
  );
}
