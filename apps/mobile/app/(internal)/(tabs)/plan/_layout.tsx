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
        }}
      />
      <Stack.Screen
        name="planned_activities/index"
        options={{
          title: "Scheduled Activities",
        }}
      />
      <Stack.Screen
        name="create_activity_plan/index"
        options={{
          title: "Create Activity Plan",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create_activity_plan/structure/index"
        options={{
          title: "Edit Structure",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create_activity_plan/structure/repeat/index"
        options={{
          title: "Edit Repeat",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create_planned_activity/index"
        options={{
          title: "Schedule Activity",
        }}
      />
    </Stack>
  );
}
