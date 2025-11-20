import { Stack } from "expo-router";

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
        }}
      />
      <Stack.Screen
        name="structure/index"
        options={{
          title: "Edit Structure",
        }}
      />
      <Stack.Screen
        name="structure/repeat/index"
        options={{
          title: "Edit Repeat",
        }}
      />
    </Stack>
  );
}
