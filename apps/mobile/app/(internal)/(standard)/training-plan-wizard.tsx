import { ROUTES } from "@/lib/constants/routes";
import { useRouter, Stack } from "expo-router";
import React from "react";
import { View } from "react-native";

export default function TrainingPlanWizard() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace(ROUTES.PLAN.TRAINING_PLAN.CREATE as any);
  }, [router]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Create Training Plan",
          headerShown: true,
        }}
      />
    </View>
  );
}
