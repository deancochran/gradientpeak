import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { TrainingPlanBuilderSheets } from "@/components/training-plan/create/TrainingPlanBuilderSheets";
import { TrainingPlanBuilderSurfaces } from "@/components/training-plan/create/TrainingPlanBuilderSurfaces";
import { useTrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import { useCreationFlowActive } from "@/lib/hooks/useCreationFlowActive";
import { omitUndefined } from "@/lib/omitUndefined";
import { useAuthStore } from "@/lib/stores/auth-store";

interface TrainingPlanBuilderScreenProps {
  mode?: "create" | "edit";
  planId?: string;
}

export function TrainingPlanBuilderScreen(props: TrainingPlanBuilderScreenProps) {
  const path = usePathname();
  const params = useGlobalSearchParams<{ returnToTrainingPlanCreate?: string }>();
  const flow = useCreationFlowActive(
    ["training-plan-create", "training-plan-edit"],
    path.endsWith("/goal-create") && params.returnToTrainingPlanCreate === "1",
    {
      ownerKey: `${props.mode ?? "create"}:${props.planId ?? "new"}`,
      isOwnedChild: (route) =>
        route.name === "goal-create" &&
        !!route.params &&
        "returnToTrainingPlanCreate" in route.params &&
        route.params.returnToTrainingPlanCreate === "1",
    },
  );
  const accountId = useAuthStore((auth) => auth.session?.user.id ?? null);
  if (!flow.active) return null;
  if (!accountId) return <Text>Sign in to create or edit a training plan.</Text>;
  return (
    <TrainingPlanBuilderScreenSession
      key={`${accountId}:${props.mode ?? "create"}:${props.planId ?? "new"}:${flow.key}`}
      {...props}
      isFlowCurrent={flow.isCurrent}
    />
  );
}

function TrainingPlanBuilderScreenSession({
  mode = "create",
  planId,
  isFlowCurrent,
}: TrainingPlanBuilderScreenProps & { isFlowCurrent: () => boolean }) {
  const controller = useTrainingPlanBuilderController(
    omitUndefined({
      mode,
      planId,
      isFlowCurrent,
    }),
  );
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
              testID="training-plan-save-button"
              variant="ghost"
            >
              {controller.header.isSaving ? <ActivityIndicator size="small" /> : null}
              <Text>{controller.header.primaryLabel}</Text>
            </Button>
          ),
        }}
      />

      <View
        className="flex-1"
        pointerEvents={builder.derived.savePlan.isLocked ? "none" : "auto"}
        accessibilityElementsHidden={builder.derived.savePlan.isLocked}
        importantForAccessibility={
          builder.derived.savePlan.isLocked ? "no-hide-descendants" : "auto"
        }
      >
        <TrainingPlanBuilderSurfaces controller={controller} />
        {controller.sheetStack.activeSheet !== "activityAssignment" ? (
          <TrainingPlanBuilderSheets controller={controller} />
        ) : null}
      </View>
    </>
  );
}
