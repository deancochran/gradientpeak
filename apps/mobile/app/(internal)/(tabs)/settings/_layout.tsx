import { Stack } from "expo-router";

/**
 * Settings Layout
 *
 * Stack-based navigation with headers and back navigation enabled for sub-pages.
 * The main settings index page doesn't need a header since it's accessible from the tab bar.
 */
export default function SettingsLayout() {
  return (
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
          title: "Settings",
          headerShown: false, // Tab screen doesn't need header
        }}
      />
      <Stack.Screen
        name="integrations"
        options={{
          title: "Integrations",
        }}
      />
      <Stack.Screen
        name="permissions"
        options={{
          title: "Permissions",
        }}
      />
      <Stack.Screen
        name="profile-edit"
        options={{
          title: "Edit Profile",
        }}
      />
    </Stack>
  );
}
