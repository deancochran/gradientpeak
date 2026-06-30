import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { TrainingPlanBuilderSheets } from "@/components/training-plan/create/TrainingPlanBuilderSheets";
import { TrainingPlanBuilderSurfaces } from "@/components/training-plan/create/TrainingPlanBuilderSurfaces";
import { useTrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

interface TrainingPlanBuilderScreenProps {
  mode?: "create" | "edit";
  planId?: string;
}

export function TrainingPlanBuilderScreen({
  mode = "create",
  planId,
}: TrainingPlanBuilderScreenProps) {
  const controller = useTrainingPlanBuilderController({ mode, planId });
  const { builder } = controller;

  if (builder.isHydratingEditPlan) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit training plan" }} />
        <View className="flex-1 items-center justify-center bg-background px-6">
          <ActivityIndicator />
          <Text className="mt-3 text-sm text-muted-foreground">Loading training plan...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: controller.header.title,
          headerRight: () => (
            <Button
              disabled={controller.header.primaryDisabled}
              onPress={() => void controller.header.save()}
              size="sm"
              variant="ghost"
            >
              {controller.header.isSaving ? <ActivityIndicator size="small" /> : null}
              <Text>{controller.header.primaryLabel}</Text>
            </Button>
          ),
        }}
      />

      <TrainingPlanBuilderSurfaces controller={controller} />
      <TrainingPlanBuilderSheets controller={controller} />
    </>
  );
}
