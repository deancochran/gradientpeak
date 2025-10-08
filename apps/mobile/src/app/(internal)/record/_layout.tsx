import { useRequireAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderProvider } from "@/lib/providers/ActivityRecorderProvider";
import { Stack } from "expo-router";

/**
 * Record Modal Layout
 *
 * This layout wraps all record-related screens (index, activity selection,
 * sensors, permissions) with a shared ActivityRecorderProvider.
 *
 * This ensures that:
 * 1. All screens share the same ActivityRecorderService instance
 * 2. Activity selections in the activity modal are reflected in the index modal
 * 3. Sensor connections persist across screen navigation
 * 4. Event listeners work reliably across all screens
 */
export default function RecordLayout() {
  const { profile } = useRequireAuth();

  return (
    <ActivityRecorderProvider profile={profile || null}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="index"
          options={{
            // 🔑 This is the key: set the entry screen to present as a modal
            presentation: "modal",
            // headerShown: true, // Show the header to allow users to close the modal
            // title: "Start New Activity",
            gestureEnabled: false,
          }}
        />
        {/*<Stack.Screen name="activity" options={{ gestureEnabled: true }} />*/}
        <Stack.Screen name="sensors" options={{ gestureEnabled: true }} />
        <Stack.Screen name="permissions" options={{ gestureEnabled: true }} />
        <Stack.Screen name="submit" options={{ gestureEnabled: false }} />
      </Stack>
    </ActivityRecorderProvider>
  );
}
