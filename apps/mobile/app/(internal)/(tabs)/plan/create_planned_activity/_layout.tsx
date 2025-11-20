import { Stack } from "expo-router";

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
        }}
      />
    </Stack>
  );
}
