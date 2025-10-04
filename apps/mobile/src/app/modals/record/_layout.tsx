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
      <Stack.Screen name="activity" options={{ gestureEnabled: true }} />
      <Stack.Screen name="sensors" options={{ gestureEnabled: true }} />
      <Stack.Screen name="permissions" options={{ gestureEnabled: true }} />
      <Stack.Screen name="submit" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
