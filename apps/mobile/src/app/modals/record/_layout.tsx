import { Stack } from "expo-router";

export default function RecordLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{
          presentation: "modal",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="activity_selection"
        options={{ gestureEnabled: true }}
      />
      <Stack.Screen name="bluetooth" options={{ gestureEnabled: true }} />
      <Stack.Screen name="permissions" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
