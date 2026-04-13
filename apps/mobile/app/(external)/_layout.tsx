// apps/native/app/(external)/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

/**
 * External Layout (Unauthenticated Pages)
 *
 * Stack-based navigation with explicit history rules.
 * Entry and transient auth screens disable swipe-back while utility drill-in screens like
 * forgot-password keep normal back navigation.
 */
export default function ExternalLayout() {
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
          title: "Welcome",
          headerShown: false, // Root screen - no back button
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="sign-in"
        options={{
          title: "Sign In",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="sign-up"
        options={{
          title: "Sign Up",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{
          title: "Forgot Password",
        }}
      />
      <Stack.Screen
        name="verify"
        options={{
          title: "Verify Email",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="sign-up-success"
        options={{
          title: "Sign Up Success",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="verification-success"
        options={{
          title: "Verification Success",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="auth-error"
        options={{
          title: "Authentication Error",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="callback"
        options={{
          title: "Completing authentication",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="reset-password"
        options={{
          title: "Reset Password",
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="storybook"
        options={{
          title: "Developer Storybook",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ui-preview"
        options={{
          title: "Developer UI Preview",
        }}
      />
    </Stack>
  );
}
