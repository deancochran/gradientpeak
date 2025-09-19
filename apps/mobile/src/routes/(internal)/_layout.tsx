// apps/native/app/(internal)/_layout.tsx
import { useAuth } from "@/lib/stores/auth-store";
import { Slot, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function InternalLayout() {
  const router = useRouter();
  const { isLoading, isAuthenticated, isHydrated, isInitialized } = useAuth();

  // Redirect automatically if user signs out
  useEffect(() => {
    if (isInitialized && isHydrated && !isLoading && !isAuthenticated) {
      router.replace("/(external)/welcome");
    }
  }, [isInitialized, isHydrated, isLoading, isAuthenticated, router]);
  // Show loading while auth state resolves
  if (!isInitialized || !isHydrated || isLoading) {
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
