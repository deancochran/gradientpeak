import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function TrainingPlansListRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.LIBRARY_WITH_RESOURCE("training_plans") as any);
  }, [router]);

  return (
    <View className="flex-1 bg-background items-center justify-center px-6">
      <ActivityIndicator size="small" />
      <Text className="text-sm text-muted-foreground mt-3 text-center">
        Redirecting to training plans in Library...
      </Text>
    </View>
  );
}
