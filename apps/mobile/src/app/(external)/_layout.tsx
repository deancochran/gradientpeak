// apps/native/app/(external)/_layout.tsx
import { useAuth } from "@/lib/hooks/useAuth";
import { router, Slot } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function ExternalLayout() {
  const { loading, isAuthenticated, isFullyLoaded } = useAuth();

  // Redirect authenticated users to internal routes
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/(internal)/(tabs)");
    }
  }, [loading, isAuthenticated]);

  // Show loading while determining auth state or redirecting
  if (loading || !isFullyLoaded || isAuthenticated) {
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
    <View className="flex-1 bg-background">
      <Slot />
    </View>
  );
}
