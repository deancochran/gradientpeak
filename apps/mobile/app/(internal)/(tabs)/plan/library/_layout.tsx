import { Stack } from "expo-router";

export default function LibraryLayout() {
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
          title: "Activity Library",
        }}
      />
    </Stack>
  );
}
