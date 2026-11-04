import { Button } from "@repo/ui/components/button";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { memo, useEffect } from "react";
import { useWatch } from "react-hook-form";
import { Pressable, useWindowDimensions, View } from "react-native";
import { shouldUseAccessibleBuilderLayout } from "@/components/training-plan/create/responsiveLayout";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import type { BuilderPlanningBriefRowViewModel } from "@/lib/training-plan-creation/builder-presentation";
import type { TrainingPlanBuilderState } from "@/lib/training-plan-creation/types";
import {
  type TrainingPlanMetadataFormValues,
  trainingPlanMetadataFormSchema,
} from "./trainingPlanMetadataForm";

type BuilderStrategyComposerProps = {
  state: TrainingPlanBuilderState;
  chartReview: TrainingPlanBuilderController["chartReview"];
  saveReadiness: TrainingPlanBuilderController["builder"]["derived"]["savePlan"]["readiness"];
  planningBriefRows: BuilderPlanningBriefRowViewModel[];
  onAddActivity: () => void;
  onOpenAthleteContext?: () => void;
  onOpenGoals?: () => void;
  onOpenPlanningConstraints?: () => void;
  onUpdateDetails: (details: TrainingPlanMetadataFormValues) => void;
  onUpdateVisibility: (
    visibility: TrainingPlanBuilderState["details"]["contentVisibility"],
  ) => void;
  showEditConfiguration?: boolean;
};

export const BuilderStrategyComposer = memo(function BuilderStrategyComposer({
  onAddActivity,
  onOpenAthleteContext,
  onOpenGoals,
  onOpenPlanningConstraints,
  onUpdateDetails,
  onUpdateVisibility,
  showEditConfiguration = false,
  planningBriefRows: _planningBriefRows,
  saveReadiness,
  state,
}: BuilderStrategyComposerProps) {
  const { fontScale, width } = useWindowDimensions();
  const useVerticalLayout = shouldUseAccessibleBuilderLayout({ fontScale, width });
  return (
    <View className="flex-1 gap-4" testID="builder-strategy-composer">
      <BuilderPlanDetailsFields details={state.details} onUpdateDetails={onUpdateDetails} />
      <View
        accessibilityLabel="Plan visibility"
        accessibilityRole="radiogroup"
        className="flex-row gap-2"
      >
        {(["private", "followers", "public"] as const).map((visibility) => {
          const label =
            visibility === "public"
              ? "Public"
              : visibility === "followers"
                ? "Followers"
                : "Private";
          const selected = state.details.contentVisibility === visibility;
          return (
            <Pressable
              key={visibility}
              accessibilityLabel={`${label} training plan`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className={`min-h-11 flex-1 items-center justify-center rounded-xl border px-3 py-2 ${selected ? "border-primary bg-primary/10" : "border-border"}`}
              onPress={() => onUpdateVisibility(visibility)}
            >
              <Text className="text-sm text-foreground">{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {showEditConfiguration ? (
        <View className="gap-2" testID="builder-edit-configuration">
          <Text className="text-sm font-semibold text-foreground">Plan settings</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button onPress={onOpenAthleteContext} size="sm" variant="outline">
              <Text>Athlete</Text>
            </Button>
            <Button onPress={onOpenGoals} size="sm" variant="outline">
              <Text>Goals</Text>
            </Button>
            <Button onPress={onOpenPlanningConstraints} size="sm" variant="outline">
              <Text>Preferences</Text>
            </Button>
          </View>
        </View>
      ) : null}
      {showEditConfiguration ? (
        <View
          className={
            useVerticalLayout
              ? "min-h-11 gap-1"
              : "min-h-11 flex-row items-center justify-between gap-3"
          }
          testID="builder-readiness"
        >
          <Text className="text-sm text-muted-foreground">Plan readiness</Text>
          <Text
            className="text-sm font-semibold text-foreground"
            numberOfLines={useVerticalLayout ? undefined : 1}
          >
            {saveReadiness.label}
          </Text>
        </View>
      ) : null}
      {showEditConfiguration ? (
        <View
          className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}
          testID="builder-schedule-actions"
        >
          <Button className="min-h-11 w-full" onPress={onAddActivity} testID="builder-add-activity">
            <Text>Add activity</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
});

function BuilderPlanDetailsFields({
  details,
  onUpdateDetails,
}: {
  details: TrainingPlanBuilderState["details"];
  onUpdateDetails: (details: TrainingPlanMetadataFormValues) => void;
}) {
  const form = useZodForm({
    schema: trainingPlanMetadataFormSchema,
    defaultValues: { name: details.name, description: details.description },
    mode: "onChange",
  });
  const values = useWatch({ control: form.control });
  useEffect(() => {
    if (values.name === details.name && values.description === details.description) return;
    onUpdateDetails({ name: values.name ?? "", description: values.description ?? "" });
  }, [details.description, details.name, onUpdateDetails, values.description, values.name]);

  return (
    <Form {...form}>
      <View className="gap-3" testID="builder-plan-details">
        <FormTextField
          control={form.control}
          label="Plan name"
          name="name"
          placeholder="e.g. Base building"
          testId="builder-plan-name-input"
        />
        <FormTextareaField
          control={form.control}
          label="Description"
          name="description"
          placeholder="What this plan is designed to do"
          testId="builder-plan-description-input"
        />
      </View>
    </Form>
  );
}
