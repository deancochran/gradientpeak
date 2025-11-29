import { Stack } from "expo-router";

export default function RoutesLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Routes",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="upload"
        options={{
          title: "Upload Route",
          presentation: "modal",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Route Details",
          headerShown: true,
        }}
      />
    </Stack>
  );
}
