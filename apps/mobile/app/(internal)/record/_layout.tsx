import { useAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderProvider } from "@/lib/providers/ActivityRecorderProvider";
import { FocusModeProvider } from "@/lib/contexts/FocusModeContext";
import { Stack } from "expo-router";

/**
 * Record Modal Layout
 *
 * Stack-based navigation with ActivityRecorderProvider and FocusModeProvider contexts.
 * This layout wraps all record-related screens with shared providers.
 *
 * This ensures:
 * 1. All screens share the same ActivityRecorderService instance
 * 2. Activity selections are reflected across screens
 * 3. Sensor connections persist across screen navigation
 * 4. Event listeners work reliably across all screens
 * 5. Focus mode state is shared across the recording interface
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
  const { profile } = useAuth();

  return (
    <ActivityRecorderProvider profile={profile || null}>
      <FocusModeProvider>
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
              headerShown: false,
              gestureEnabled: false, // Prevent accidental exit during recording
            }}
          />
          <Stack.Screen
            name="activity"
            options={{
              title: "Select Activity",
              gestureEnabled: true,
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
            name="plan"
            options={{
              title: "Select Activity Plan",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="route"
            options={{
              title: "Select Route",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="route-preview"
            options={{
              title: "Route Preview",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ftms"
            options={{
              title: "Trainer Control",
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
      </FocusModeProvider>
    </ActivityRecorderProvider>
  );
}
