import { useRequireAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderProvider } from "@/lib/providers/ActivityRecorderProvider";
import { Stack } from "expo-router";

/**
 * Record Modal Layout
 *
 * Stack-based navigation with ActivityRecorderProvider context.
 * This layout wraps all record-related screens with a shared ActivityRecorderProvider.
 *
 * This ensures:
 * 1. All screens share the same ActivityRecorderService instance
 * 2. Activity selections are reflected across screens
 * 3. Sensor connections persist across screen navigation
 * 4. Event listeners work reliably across all screens
 *
 * Navigation features:
 * ✓ Standard headers with back navigation for sub-screens
 * ✓ Gesture navigation enabled (except where business logic requires it disabled)
 * ✓ Consistent slide animations
 *
 * Business Logic Constraints:
 * - index: Gestures disabled to prevent accidental exit during recording
 * - submit: Gestures disabled to prevent data loss during submission
 */
export default function RecordLayout() {
  const { profile } = useRequireAuth();

  return (
    <ActivityRecorderProvider profile={profile || null}>
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
            title: "Record Activity",
            presentation: "modal",
            headerShown: false,
            gestureEnabled: false, // Prevent accidental exit during recording
          }}
        />
        <Stack.Screen
          name="sensors"
          options={{
            title: "Sensors",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="permissions"
          options={{
            title: "Permissions",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="submit"
          options={{
            title: "Submit Activity",
            headerShown: false,
            gestureEnabled: false, // Prevent accidental navigation during submission
          }}
        />
      </Stack>
    </ActivityRecorderProvider>
  );
}
