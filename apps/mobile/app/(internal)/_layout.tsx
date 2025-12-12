// apps/native/app/(internal)/_layout.tsx
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * Internal Layout (Authenticated Pages)
 *
 * Stack-based navigation with consistent headers and back navigation.
 * All authenticated pages support proper navigation and can be navigated back from.
 *
 * Structure:
 * - (tabs) - Tab-based navigation (home, plan, record-launcher, trends, settings)
 * - activities - Completed activity history (has its own Stack layout)
 * - follow-along - Activity follow-along screens
 * - record - Activity recording screens (has its own Stack layout)
 * - routes - Route management screens (has its own Stack layout)
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
        headerBackTitle: "Back",
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="activities"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="follow-along/index"
        options={{
          title: "Follow Along",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="record"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="routes"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
