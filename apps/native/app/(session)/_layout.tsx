import { Stack } from "expo-router";

export default function SessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: "slide_from_bottom",
      }}
    >
      <Stack.Screen
        name="record"
        options={{
          title: "Record Activity",
          presentation: "fullScreenModal",
          gestureEnabled: false, // Prevent accidental dismissal during recording
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="bluetooth"
        options={{
          title: "Bluetooth Devices",
          presentation: "containedModal",
          gestureEnabled: true,
          animation: "slide_from_bottom",
          animationDuration: 300,
        }}
      />
      <Stack.Screen
        name="permissions"
        options={{
          title: "Permissions",
          presentation: "containedModal",
          gestureEnabled: true,
          animation: "slide_from_bottom",
          animationDuration: 300,
        }}
      />
      <Stack.Screen
        name="select-workout"
        options={{
          title: "Select Workout",
          presentation: "containedModal",
          gestureEnabled: true,
          animation: "slide_from_bottom",
          animationDuration: 300,
        }}
      />
    </Stack>
  );
}
