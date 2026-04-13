// apps/native/app/(external)/_layout.tsx
import { Stack, usePathname, useRouter } from "expo-router";
import React from "react";

import { useAuth } from "@/lib/hooks/useAuth";

const AUTHENTICATED_UNVERIFIED_ALLOWED_PATHS = new Set([
  "/(external)/verify",
  "/(external)/callback",
  "/(external)/verification-success",
  "/(external)/auth-error",
  "/(external)/reset-password",
]);

/**
 * External Layout (Unauthenticated Pages)
 *
 * Stack-based navigation with explicit history rules.
 * Entry and transient auth screens disable swipe-back while utility drill-in screens like
 * forgot-password keep normal back navigation.
 */
export default function ExternalLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isEmailVerified, isFullyLoaded } = useAuth();

  React.useEffect(() => {
    if (!isFullyLoaded || !isAuthenticated) {
      return;
    }

    if (isEmailVerified) {
      router.replace("/");
      return;
    }

    if (!AUTHENTICATED_UNVERIFIED_ALLOWED_PATHS.has(pathname)) {
      router.replace("/(external)/verify");
    }
  }, [isAuthenticated, isEmailVerified, isFullyLoaded, pathname, router]);

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
