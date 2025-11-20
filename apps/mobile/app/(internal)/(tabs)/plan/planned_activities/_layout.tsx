import { Stack } from "expo-router";

export default function PlannedActivitiesLayout() {
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
          title: "Scheduled Activities",
        }}
      />
      <Stack.Screen
        name="[activity_uuid]/index"
        options={{
          title: "Activity Details",
        }}
      />
    </Stack>
  );
}
