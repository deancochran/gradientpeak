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
          title: "Activity Library",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="planned_activities/index"
        options={{
          title: "Scheduled Activities",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="create_activity_plan/index"
        options={{
          title: "Create Activity Plan",
          headerShown: true,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="create_activity_plan/structure"
        options={{
          title: "Edit Structure",
          headerShown: true,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="create_planned_activity/index"
        options={{
          title: "Schedule Activity",
          presentation: "modal",
        }}
      />
    </Stack>
  );
}
