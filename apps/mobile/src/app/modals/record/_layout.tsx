import { Stack } from "expo-router";

export default function RecordLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "Selection" }} />
      <Stack.Screen
        name="planned_activity_selection"
        options={{ title: "Planned Activity" }}
      />
      <Stack.Screen
        name="unplanned_activity_selection"
        options={{ title: "Unplanned Activity" }}
      />
      <Stack.Screen
        name="ble"
        options={{ presentation: "modal", title: "BLE" }}
      />
      <Stack.Screen
        name="permissions"
        options={{ presentation: "modal", title: "Permissions" }}
      />
      <Stack.Screen name="recording" options={{ title: "Recording" }} />
      <Stack.Screen name="save" options={{ title: "Save Activity" }} />
    </Stack>
  );
}
