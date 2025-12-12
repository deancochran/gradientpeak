import { Stack } from "expo-router";

/**
 * Trends Tab Layout
 *
 * Stack-based navigation with consistent headers and back navigation.
 * The main trends index page doesn't need a header since it's accessible from the tab bar.
 *
 * Navigation Structure:
 * - /trends/index - Main trends screen (no back button - tab root screen)
 *
 * Future sub-pages will automatically support:
 * ✓ Headers with back navigation
 * ✓ Swipe gestures to go back
 * ✓ Consistent slide animations
 */
export default function TrendsLayout() {
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
          title: "Trends",
          headerShown: false, // Tab screen doesn't need header
        }}
      />
    </Stack>
  );
}
