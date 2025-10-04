import { useRequireAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderProvider } from "@/lib/providers/ActivityRecorderProvider";
import { Stack } from "expo-router";

export default function RecordLayout() {
  const { profile } = useRequireAuth();

  return (
    <ActivityRecorderProvider profileId={profile.id}>
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
    </ActivityRecorderProvider>
  );
}
