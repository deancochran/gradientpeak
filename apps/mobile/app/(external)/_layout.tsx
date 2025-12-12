// apps/native/app/(external)/_layout.tsx
import { useRedirectIfAuthenticated } from "@/lib/hooks/useAuth";
import { Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * External Layout (Unauthenticated Pages)
 *
 * Stack-based navigation with consistent headers and back navigation.
 * All unauthenticated pages (sign-in, sign-up, forgot-password, etc.) support back navigation.
 */
export default function ExternalLayout() {
  console.log("ExternalLayout loaded");
  const { loading, isAuthenticated, isFullyLoaded } =
    useRedirectIfAuthenticated();

  React.useEffect(() => {
    console.log("isAuthenticated =", isAuthenticated);
  }, [isAuthenticated]);

  // Show loading while determining auth state or redirecting
  if (loading || !isFullyLoaded || isAuthenticated) {
    console.log("Loading...", loading, isAuthenticated, isFullyLoaded);
    return (
      <View
        className="flex-1 bg-background justify-center items-center"
        testID="auth-loading-screen"
      >
        <ActivityIndicator
          size="large"
          className="text-foreground"
          testID="auth-loading-indicator"
        />
      </View>
    );
  }

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
