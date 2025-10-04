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
    </Stack>
  );
}
