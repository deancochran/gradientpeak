import { Stack } from "expo-router";

/**
 * Activities Layout (Completed Activities)
 *
 * Stack-based navigation for viewing completed activities history.
 * This is separate from planned activities (which are in the plan tab).
 *
 * Structure:
 * - /activities/index - Paginated list of completed activities
 * - /activities/[activityId] - Detailed view with charts and metrics
 *
 * Navigation features:
 * ✓ Standard headers with back navigation
 * ✓ Gesture navigation enabled
 * ✓ Consistent slide animations
 * ✓ Tab-agnostic (accessible from home, trends, plan, anywhere)
 */
export default function ActivitiesLayout() {
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
          title: "Activities",
        }}
      />
      <Stack.Screen
        name="[activityId]/index"
        options={{
          title: "Activity Details",
          headerShown: true,
        }}
      />
    </Stack>
  );
}
