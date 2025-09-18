// apps/native/app/(external)/_layout.tsx
import { useAuth } from "@/lib/stores";
import { router, Slot } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function ExternalLayout() {
  const { loading, initialized, hydrated, isAuthenticated } = useAuth();

  // Redirect authenticated users to internal routes
  useEffect(() => {
    if (initialized && hydrated && !loading && isAuthenticated) {
      router.replace("/(internal)");
    }
  }, [initialized, hydrated, loading, isAuthenticated]);

  // Show loading while determining auth state or redirecting
  if (!initialized || !hydrated || loading || isAuthenticated) {
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
