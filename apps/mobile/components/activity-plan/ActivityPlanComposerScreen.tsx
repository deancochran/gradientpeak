import {
  type ActivityPlanDraftStep,
  type ActivityTargetCategory,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityPlanBasicsSection } from "@/components/activity-plan/ActivityPlanBasicsSection";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { ActivityPlanEstimatePresentation } from "@/components/activity-plan/ActivityPlanEstimatePresentation";
import { StepEditorDialog } from "@/components/activity-plan/activity/StepEditorDialog";
import {
  canRetainSavedMobileActivityPlanEstimateMetrics,
  resolveMobileActivityPlanEstimateMetrics,
} from "@/components/activity-plan/resolveMobileActivityPlanEstimateMetrics";
import { StructureBuilderCard } from "@/components/activity-plan/structure/StructureBuilderCard";
import { useActivityPlanBasicsForm } from "@/components/activity-plan/useActivityPlanBasicsForm";
import { useActivityPlanComposerProcess } from "@/components/activity-plan/useActivityPlanComposerProcess";
import { createIncompleteActivityPlanStep } from "@/lib/activityPlanDefaults";
import { api } from "@/lib/api";
import { useActivityPlanForm } from "@/lib/hooks/forms/useActivityPlanForm";
import { useAuth } from "@/lib/hooks/useAuth";
import { omitUndefined } from "@/lib/omitUndefined";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

export type ActivityPlanComposerModeContract =
  | { mode: "create"; planId?: never }
  | { mode: "edit"; planId: string };

/** V5 authoring surface: an ordered sequence of standalone steps and repeat groups. */
export function ActivityPlanComposerScreen(
  props: ActivityPlanComposerModeContract & {
    initialActivityCategory?: ActivityTargetCategory;
    isFlowCurrent?: () => boolean;
  },
) {
  const isEditMode = props.mode === "edit";
  const router = useRouter();
  const navigation = useNavigation();
  const { profile } = useAuth();
  const allowNavigationRef = useRef(false);
  const { bottom } = useSafeAreaInsets();
  const [editingStep, setEditingStep] = useState<{
    step: ActivityPlanDraftStep;
    isNew: boolean;
  } | null>(null);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const {
    insertItem,
    removeItem,
    duplicateItem,
    moveItem,
    ungroupRepeat,
    updateStep,
    updateRepeatCount,
  } = useActivityPlanCreationStore();
  const { data: viewerReadModel, isLoading: athleteFactsLoading } =
    api.athleteIntelligence.getReadModel.useQuery(
      { sections: { publishedState: true } },
      { enabled: Boolean(profile), refetchOnWindowFocus: false },
    );
  const unavailablePerformanceTargets = useMemo(
    () => createUnavailableAthletePerformanceTargetFacts(new Date().toISOString()),
    [],
  );
  const {
    form,
    setName,
    setDescription,
    setActivityCategory,
    submit,
    validation,
    isSubmitting,
    isLoading,
    isEditBlocked,
    editStatus,
    hydrationVersion,
    persistedMetrics,
    hydratedEditPlanId,
    hydratedStructure,
    reloadFromServer,
    retryLoad,
    submitError,
  } = useActivityPlanForm(
    omitUndefined({
      planId: isEditMode ? props.planId : undefined,
      ...(props.isFlowCurrent ? { isCurrent: props.isFlowCurrent } : {}),
      onSuccess: (planId: string) => {
        if (props.isFlowCurrent && !props.isFlowCurrent()) return;
        allowNavigationRef.current = true;
        if (isEditMode) {
          router.back();
          return;
        }
        router.replace({ pathname: "/activity-plan-detail", params: { planId } });
      },
      onError: () =>
        Alert.alert(
          "Error",
          `Failed to ${isEditMode ? "update" : "save"} activity plan. Please try again.`,
        ),
      onConflict: () =>
        Alert.alert(
          "Plan changed elsewhere",
          "Your edits are still here. Reloading replaces them with the latest plan.",
          [
            { text: "Keep editing", style: "cancel" },
            { text: "Reload server plan", onPress: () => void reloadFromServer() },
          ],
        ),
    }),
  );
  // Do not turn an untouched composer into a wall of errors. After Save, keep
  // recovery focused on the first actionable boundary issue.
  const visibleValidationErrors = useMemo(() => {
    if (!saveAttempted) return {};
    const firstKey = Object.keys(validation.errors)[0];
    return firstKey ? { [firstKey]: validation.errors[firstKey] } : {};
  }, [saveAttempted, validation.errors]);
  const basicsForm = useActivityPlanBasicsForm(
    omitUndefined({
      description: form.description,
      name: form.name,
      nameError: visibleValidationErrors.name,
      onDescriptionChange: setDescription,
      onNameChange: setName,
    }),
  );
  const items = form.structure.items;
  const activityCategory = form.activityCategory;
  const addStep = (repeatId?: string) => {
    if (!activityCategory) return;
    const step = createIncompleteActivityPlanStep();
    const repeat = repeatId
      ? items.find(
          (item): item is Extract<typeof item, { type: "repeat" }> =>
            item.type === "repeat" && item.id === repeatId,
        )
      : undefined;
    const inserted = insertItem(
      step,
      repeatId ? { repeatId, index: repeat?.steps.length ?? 0 } : undefined,
    );
    if (inserted.success) setEditingStep({ step, isNew: true });
  };
  const appliedInitialCategory = useRef(false);
  useEffect(() => {
    if (
      !appliedInitialCategory.current &&
      !isEditMode &&
      !activityCategory &&
      props.initialActivityCategory
    ) {
      appliedInitialCategory.current = true;
      setActivityCategory(props.initialActivityCategory);
    }
  }, [activityCategory, isEditMode, props.initialActivityCategory, setActivityCategory]);
  const retainsSavedMetricsWhileFactsLoad = canRetainSavedMobileActivityPlanEstimateMetrics({
    athleteFactsLoading,
    editPlanId: props.planId,
    hydratedPlanId: hydratedEditPlanId,
    hydratedStructure,
    isEditMode,
    structure: form.structure,
  });
  const draftMetrics = useMemo(
    () =>
      resolveMobileActivityPlanEstimateMetrics({
        structure: form.structure,
        performanceTargets:
          viewerReadModel?.publishedState?.performanceTargets ??
          (retainsSavedMetricsWhileFactsLoad ? undefined : unavailablePerformanceTargets),
        persistedMetrics,
      }),
    [
      form.structure,
      unavailablePerformanceTargets,
      viewerReadModel?.publishedState?.performanceTargets,
      persistedMetrics,
      retainsSavedMetricsWhileFactsLoad,
    ],
  );
  useActivityPlanComposerProcess({
    activityCategory: activityCategory ?? "",
    allowNavigationRef,
    description: form.description,
    isEditMode,
    isEditBlocked,
    hydrationVersion,
    isLoading,
    isSubmitting,
    name: form.name,
    navigation,
    structure: form.structure,
    submit,
    onAttempt: () => setSaveAttempted(true),
  });
  if (isLoading)
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-muted-foreground">Loading plan...</Text>
      </View>
    );
  if (isEditBlocked)
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text accessibilityRole="header" className="text-lg font-semibold">
          Plan unavailable
        </Text>
        <Text className="text-center text-muted-foreground">
          {editStatus === "error"
            ? "The latest plan could not be loaded. Your changes have been kept."
            : "This plan uses an unsupported activity structure and was not changed."}
        </Text>
        {editStatus === "error" ? (
          <Button onPress={() => void retryLoad()}>
            <Text>Retry</Text>
          </Button>
        ) : null}
        <Button onPress={() => router.back()}>
          <Text>Back to plans</Text>
        </Button>
      </View>
    );
  return (
    <View className="flex-1 bg-background">
      {submitError ? (
        <Text accessibilityRole="alert" className="px-6 text-destructive">
          {submitError}
        </Text>
      ) : null}
      <NestableScrollContainer
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: Math.max(24, bottom + 16),
        }}
      >
        <View className="gap-6" pointerEvents={isSubmitting ? "none" : "auto"}>
          <View className="gap-4 rounded-3xl border border-border bg-card p-4">
            <ActivityPlanBasicsSection
              disabled={isSubmitting}
              activityCategory={activityCategory ?? ""}
              {...omitUndefined({
                activityCategoryError: visibleValidationErrors.activity_category,
              })}
              form={basicsForm}
              onChangeActivityCategory={(value) =>
                setActivityCategory(value as ActivityTargetCategory)
              }
            />
            <ActivityPlanEstimatePresentation metrics={draftMetrics} />
          </View>
          <View className="gap-2" testID="activity-plan-draft-timeline">
            <ActivityPlanContentPreview plan={{ structure: form.structure }} size="medium" />
          </View>
          {activityCategory ? (
            <StructureBuilderCard
              activityCategory={activityCategory}
              items={items}
              validationErrors={visibleValidationErrors}
              onEditStep={(step) => setEditingStep({ step, isNew: false })}
              onAddStep={addStep}
              onAddRepeat={() => {
                insertItem({ type: "repeat", id: randomUUID(), count: 2, steps: [] });
              }}
              onRemove={removeItem}
              onDuplicate={duplicateItem}
              onUngroup={ungroupRepeat}
              onMove={moveItem}
              onRepeatCount={updateRepeatCount}
            />
          ) : (
            <Text className="text-sm text-muted-foreground">
              Choose an activity category before adding steps.
            </Text>
          )}
        </View>
      </NestableScrollContainer>
      <View
        className="flex-row gap-2 border-t border-border bg-background px-4 py-3"
        style={{ paddingBottom: Math.max(12, bottom) }}
      >
        <Button
          disabled={!activityCategory || isSubmitting}
          variant="ghost"
          onPress={() => addStep()}
          accessibilityLabel="Add step"
          testID="activity-plan-add-step"
        >
          <Text>Add Step</Text>
        </Button>
        <Button
          disabled={!activityCategory || isSubmitting}
          variant="ghost"
          onPress={() => insertItem({ type: "repeat", id: randomUUID(), count: 2, steps: [] })}
          accessibilityLabel="Add repeat"
          testID="activity-plan-add-repeat"
        >
          <Text>Add Repeat</Text>
        </Button>
      </View>
      {editingStep && activityCategory ? (
        <StepEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingStep(null);
          }}
          step={editingStep.step}
          activityCategory={activityCategory}
          isNew={editingStep.isNew}
          onDiscard={editingStep.isNew ? () => removeItem(editingStep.step.id) : undefined}
          onSave={(step) => {
            const outcome = updateStep(step);
            if (!outcome.success) throw new Error(outcome.error);
          }}
        />
      ) : null}
    </View>
  );
}
