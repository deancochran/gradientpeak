import { Stack } from "expo-router";

export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "transparentModal",
        gestureEnabled: true,
        animationTypeForReplace: "push",
      }}
    >
      <Stack.Screen
        name="reset-password"
        options={{
          title: "Reset Password",
          presentation: "modal",
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
