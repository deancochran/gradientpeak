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

  if (
    mode === "edit" &&
    (builder.editPlanQuery.isError || builder.linkedActivityPlansQuery.isError)
  ) {
    const error = builder.editPlanQuery.error ?? builder.linkedActivityPlansQuery.error;
    return (
      <>
        <Stack.Screen options={{ title: "Edit training plan" }} />
        <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
          <Text className="text-center text-lg font-semibold text-foreground">
            Could not load this training plan
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            {error?.message || "Check your connection and try again."}
          </Text>
          <Button
            accessibilityLabel="Retry loading training plan"
            onPress={() => {
              void builder.editPlanQuery.refetch();
              void builder.linkedActivityPlansQuery.refetch();
            }}
          >
            <Text>Retry</Text>
          </Button>
        </View>
      </>
    );
  }

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
              accessibilityLabel={controller.header.primaryLabel}
              accessibilityState={{ disabled: controller.header.primaryDisabled }}
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
