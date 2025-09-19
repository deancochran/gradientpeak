// apps/native/app/(external)/_layout.tsx
import { useAuth } from "@/lib/stores/auth-store";
import { router, Slot } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function ExternalLayout() {
  const { isLoading, isAuthenticated, isHydrated, isInitialized } = useAuth();

  // Redirect authenticated users to internal routes
  useEffect(() => {
    if (isInitialized && isHydrated && !isLoading && isAuthenticated) {
      router.replace("/(internal)/(tabs)");
    }
  }, [isInitialized, isHydrated, isLoading, isAuthenticated]);

  // Show loading while determining auth state or redirecting
  if (!isInitialized || !isHydrated || isLoading || isAuthenticated) {
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
