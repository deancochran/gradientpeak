// apps/native/app/(external)/_layout.tsx
import { useRedirectIfAuthenticated } from "@/lib/hooks/useAuth";
import { Slot } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

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
    <View className="flex-1 bg-background">
      <Slot />
    </View>
  );
}
