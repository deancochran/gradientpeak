// apps/native/app/(internal)/_layout.tsx
import { useAuth } from "@/lib/hooks/useAuth";
import { Slot, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function InternalLayout() {
  const router = useRouter();
  const { loading, isAuthenticated, isFullyLoaded } = useAuth();

  // Redirect automatically if user signs out
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, router]);
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
