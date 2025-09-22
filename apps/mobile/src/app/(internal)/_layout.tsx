// apps/native/app/(internal)/_layout.tsx
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { Slot } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

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
    <View className="flex-1 bg-background">
      <Slot />
    </View>
  );
}
