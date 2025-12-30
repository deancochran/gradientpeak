// apps/native/app/(internal)/_layout.tsx
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * Internal Layout (Authenticated Pages)
 *
 * This layout manages the three main groups of authenticated pages:
 *
 * 1. (tabs) - Tab-based navigation
 *    - Shows tab bar footer
 *    - No back buttons
 *    - Home, Discover, Plan, Library tabs
 *
 * 2. (standard) - Stack-based modal pages
 *    - Shows header with back button
 *    - No tab bar footer
 *    - Card-style presentation
 *    - Activities, settings, plan library, etc.
 *
 * 3. record - Isolated recording experience
 *    - No tab bar
 *    - No header (on main screen)
 *    - Full-screen immersive experience
 *    - Has its own sub-navigation for sensors, submit
 *
 * Navigation Structure:
 * - (tabs) group handles all tab navigation internally
 * - (standard) group handles modal-style pages with headers
 * - record group is completely isolated
 */
export default function InternalLayout() {
  console.log("InternalLayout loaded");
  const { loading, isFullyLoaded } = useRequireAuth("/(external)/sign-in");

  // Show loading while auth state resolves
  if (loading || !isFullyLoaded) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" className="text-foreground" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      {/* Tab Navigation - No header, has tab bar */}
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />

      {/* Standard Pages - Headers with back buttons, no tab bar */}
      <Stack.Screen
        name="(standard)"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />

      {/* Record - Isolated full-screen experience */}
      <Stack.Screen
        name="record"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
