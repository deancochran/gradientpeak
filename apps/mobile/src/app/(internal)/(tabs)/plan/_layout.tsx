import { Stack } from "expo-router";

export default function PlanLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Plan",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="library/index"
        options={{
          title: "Workout Library",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="planned_activities/index"
        options={{
          title: "Scheduled Workouts",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="create_activity_plan/index"
        options={{
          title: "Create Plan",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="create_planned_activity/index"
        options={{
          title: "Schedule Workout",
          presentation: "modal",
        }}
      />
    </Stack>
  );
}
