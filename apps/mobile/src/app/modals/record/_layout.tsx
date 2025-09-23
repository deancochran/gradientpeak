import { Stack } from "expo-router";

export default function RecordLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{
          presentation: "fullScreenModal",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="activity_selection"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen name="bluetooth" options={{ presentation: "modal" }} />
      <Stack.Screen name="permissions" options={{ presentation: "modal" }} />
    </Stack>
  );
}
