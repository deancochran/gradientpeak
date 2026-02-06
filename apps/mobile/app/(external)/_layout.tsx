// apps/native/app/(external)/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

/**
 * External Layout (Unauthenticated Pages)
 *
 * Stack-based navigation with consistent headers and back navigation.
 * All unauthenticated pages (sign-in, sign-up, forgot-password, etc.) support back navigation.
 */
export default function ExternalLayout() {
  console.log("ExternalLayout loaded");

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
          title: "Sign In",
          headerShown: false, // Root screen - no back button
        }}
      />
      <Stack.Screen
        name="sign-up"
        options={{
          title: "Sign Up",
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
        }}
      />
      <Stack.Screen
        name="sign-up-success"
        options={{
          title: "Sign Up Success",
        }}
      />
      <Stack.Screen
        name="verification-success"
        options={{
          title: "Verification Success",
        }}
      />
      <Stack.Screen
        name="auth-error"
        options={{
          title: "Authentication Error",
        }}
      />
      <Stack.Screen
        name="callback"
        options={{
          title: "Authenticating",
        }}
      />
    </Stack>
  );
}
