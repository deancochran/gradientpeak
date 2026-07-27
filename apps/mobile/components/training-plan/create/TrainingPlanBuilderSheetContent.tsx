import type { ActivityPlanPlanningEstimate, TrainingPreferenceValidationIssue } from "@repo/core";
import { validatePlanningPreferencesConsistency } from "@repo/core";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UseFormReturn } from "react-hook-form";
import { Pressable, View } from "react-native";
import type { ActivityPlan } from "@/components/shared/ActivityPlanCard";
import {
  type ActivityCategoryFilter,
  type ActivityPlanSort,
  BuilderActivityAssignmentSheetContent,
  BuilderActivityFiltersSheetContent,
} from "@/components/training-plan/create/BuilderActivityAssignmentSheetContent";
import {
  BuilderAthleteContextForm,
  BuilderPlanPreferencesContextForm,
} from "@/components/training-plan/create/BuilderAssumptionsPreferencesForms";
import {
  BuilderGoalEditorContent,
  BuilderLocalGoalCreateContent,
} from "@/components/training-plan/create/BuilderGoalEditorSheetContent";
import { BuilderSchedulePreviewContent } from "@/components/training-plan/create/BuilderSchedulePreviewSheetContent";
import { BuilderSessionEditorContent } from "@/components/training-plan/create/BuilderSessionEditorSheetContent";
import {
  addTrainingPlanPreferenceField,
  applyTrainingPlanPreferenceFieldOverride,
  type TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";
import { trainingPlanBuilderPlanPreferencesSchema } from "@/lib/training-plan-creation/schemas";
import type { TrainingPlanBuilderPlanPreferences } from "@/lib/training-plan-creation/types";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";
import type { BuilderSheet } from "./BuilderSheetTypes";
import {
  type TrainingPlanMetadataFormValues,
  trainingPlanMetadataFormSchema,
} from "./trainingPlanMetadataForm";

type TrainingPlanBuilderService = ReturnType<typeof useTrainingPlanCreationService>;

type TrainingPlanBuilderSheetDraftsContextValue = {
  canResetActivityFilters: boolean;
  canResetPlanningPreferences: boolean;
  canSavePlanningPreferences: boolean;
  canSaveMetadata: boolean;
  draftActivityPlanCategoryFilter: ActivityCategoryFilter;
  draftActivityPlanSort: ActivityPlanSort;
  draftPlanningConstraintFields: TrainingPlanBuilderService["derived"]["planningConstraintFields"];
  planningPreferenceIssues: TrainingPreferenceValidationIssue[];
  planningPreferencesForm: UseFormReturn<TrainingPlanBuilderPlanPreferences>;
  metadataForm: UseFormReturn<TrainingPlanMetadataFormValues>;
  draftTemplateVisibility: "private" | "public";
  applyActivityFiltersDraft: () => void;
  applyPlanningPreferencesDraft: () => void;
  applyMetadataDraft: () => boolean;
  cancelDraftForSheet: (sheet: BuilderSheet | null) => void;
  cancelSheetDrafts: () => void;
  prepareActivityFiltersDraft: () => void;
  preparePlanningPreferencesDraft: () => void;
  resetActivityFiltersDraft: () => void;
  addPlanningConstraintDraft: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
  updatePlanningConstraintDraft: (
    fieldKey: TrainingPlanPreferenceFieldKey,
    value: number | null,
  ) => void;
  setDraftTemplateVisibility: Dispatch<SetStateAction<"private" | "public">>;
  setDraftActivityPlanCategoryFilter: Dispatch<SetStateAction<ActivityCategoryFilter>>;
  setDraftActivityPlanSort: Dispatch<SetStateAction<ActivityPlanSort>>;
};

const TrainingPlanBuilderSheetDraftsContext =
  createContext<TrainingPlanBuilderSheetDraftsContextValue | null>(null);

type TrainingPlanBuilderSheetDraftsProviderProps = {
  activeSheet: BuilderSheet | null;
  activityPlanCategoryFilter: ActivityCategoryFilter;
  activityPlanSort: ActivityPlanSort;
  children: ReactNode;
  planningConstraintFields: TrainingPlanBuilderService["derived"]["planningConstraintFields"];
  planPreferences: TrainingPlanBuilderPlanPreferences;
  planMetadata: {
    name: string;
    description: string;
    templateVisibility: "private" | "public";
  };
  onApplyActivityFilters: (filters: {
    categoryFilter: ActivityCategoryFilter;
    sort: ActivityPlanSort;
  }) => void;
  onApplyPlanningPreferences: (preferences: TrainingPlanBuilderPlanPreferences) => void;
  onApplyMetadata: (
    metadata: TrainingPlanMetadataFormValues & { templateVisibility: "private" | "public" },
  ) => void;
};

export function TrainingPlanBuilderSheetDraftsProvider({
  activeSheet,
  activityPlanCategoryFilter,
  activityPlanSort,
  children,
  planningConstraintFields,
  planPreferences,
  planMetadata,
  onApplyActivityFilters,
  onApplyPlanningPreferences,
  onApplyMetadata,
}: TrainingPlanBuilderSheetDraftsProviderProps) {
  const metadataForm = useZodForm({
    schema: trainingPlanMetadataFormSchema,
    defaultValues: { name: planMetadata.name, description: planMetadata.description },
    mode: "onChange",
  });
  const [draftTemplateVisibility, setDraftTemplateVisibility] = useState(
    planMetadata.templateVisibility,
  );
  const planningPreferencesForm = useZodForm({
    schema: trainingPlanBuilderPlanPreferencesSchema,
    defaultValues: planPreferences,
    mode: "onChange",
  }) as UseFormReturn<TrainingPlanBuilderPlanPreferences>;
  const draftPlanningPreferences = trainingPlanBuilderPlanPreferencesSchema.parse(
    planningPreferencesForm.watch(),
  );
  const canResetPlanningPreferences = planningPreferencesForm.formState.isDirty;
  const planningPreferenceIssues = useMemo(
    () => validatePlanningPreferencesConsistency(draftPlanningPreferences),
    [draftPlanningPreferences],
  );
  const canSavePlanningPreferences = planningPreferenceIssues.every(
    (issue) => issue.severity !== "blocking",
  );
  const metadataValues = metadataForm.watch();
  const canSaveMetadata = trainingPlanMetadataFormSchema.safeParse(metadataValues).success;
  const [draftActivityPlanCategoryFilter, setDraftActivityPlanCategoryFilter] =
    useState<ActivityCategoryFilter>(activityPlanCategoryFilter);
  const [draftActivityPlanSort, setDraftActivityPlanSort] = useState(activityPlanSort);
  const draftPlanningConstraintFields = useMemo(
    () =>
      planningConstraintFields.map((field) => ({
        ...field,
        visible: field.visible || draftPlanningPreferences[field.key] !== null,
        value: {
          ...field.value,
          value: draftPlanningPreferences[field.key],
          source:
            draftPlanningPreferences[field.key] === null ? field.value.source : "manual_override",
          overridden: draftPlanningPreferences[field.key] !== null,
        },
      })),
    [draftPlanningPreferences, planningConstraintFields],
  );

  useEffect(() => {
    if (activeSheet === "preferences") {
      planningPreferencesForm.reset(planPreferences);
    }
  }, [activeSheet, planPreferences, planningPreferencesForm]);

  const prepareMetadataDraft = useCallback(() => {
    metadataForm.reset({ name: planMetadata.name, description: planMetadata.description });
    setDraftTemplateVisibility(planMetadata.templateVisibility);
  }, [metadataForm, planMetadata.description, planMetadata.name, planMetadata.templateVisibility]);

  useEffect(() => {
    if (activeSheet === "metadata") {
      prepareMetadataDraft();
    }
  }, [activeSheet, prepareMetadataDraft]);

  const prepareActivityFiltersDraft = useCallback(() => {
    setDraftActivityPlanCategoryFilter(activityPlanCategoryFilter);
    setDraftActivityPlanSort(activityPlanSort);
  }, [activityPlanCategoryFilter, activityPlanSort]);

  const preparePlanningPreferencesDraft = useCallback(() => {
    planningPreferencesForm.reset(planPreferences);
  }, [planPreferences, planningPreferencesForm]);

  const resetActivityFiltersDraft = useCallback(() => {
    setDraftActivityPlanCategoryFilter(null);
    setDraftActivityPlanSort("newest");
  }, []);

  const cancelDraftForSheet = useCallback(
    (sheet: BuilderSheet | null) => {
      if (sheet === "activityFilters") {
        prepareActivityFiltersDraft();
      }
      if (sheet === "metadata") {
        prepareMetadataDraft();
      }
      if (sheet === "preferences") {
        preparePlanningPreferencesDraft();
      }
    },
    [prepareActivityFiltersDraft, prepareMetadataDraft, preparePlanningPreferencesDraft],
  );

  const cancelSheetDrafts = useCallback(() => {
    prepareActivityFiltersDraft();
    preparePlanningPreferencesDraft();
    prepareMetadataDraft();
  }, [prepareActivityFiltersDraft, prepareMetadataDraft, preparePlanningPreferencesDraft]);

  const applyActivityFiltersDraft = useCallback(() => {
    onApplyActivityFilters({
      categoryFilter: draftActivityPlanCategoryFilter,
      sort: draftActivityPlanSort,
    });
  }, [draftActivityPlanCategoryFilter, draftActivityPlanSort, onApplyActivityFilters]);

  const setPlanningPreferencesDraft = useCallback(
    (preferences: TrainingPlanBuilderPlanPreferences) => {
      planningPreferencesForm.reset(trainingPlanBuilderPlanPreferencesSchema.parse(preferences));
    },
    [planningPreferencesForm],
  );

  const addPlanningConstraintDraft = useCallback(
    (fieldKey: TrainingPlanPreferenceFieldKey) => {
      setPlanningPreferencesDraft(
        addTrainingPlanPreferenceField(planningPreferencesForm.getValues(), fieldKey),
      );
    },
    [planningPreferencesForm, setPlanningPreferencesDraft],
  );

  const updatePlanningConstraintDraft = useCallback(
    (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => {
      setPlanningPreferencesDraft(
        applyTrainingPlanPreferenceFieldOverride(
          planningPreferencesForm.getValues(),
          fieldKey,
          value,
        ),
      );
    },
    [planningPreferencesForm, setPlanningPreferencesDraft],
  );

  const applyPlanningPreferencesDraft = useCallback(() => {
    if (!canSavePlanningPreferences) {
      return;
    }
    onApplyPlanningPreferences(
      trainingPlanBuilderPlanPreferencesSchema.parse(planningPreferencesForm.getValues()),
    );
  }, [canSavePlanningPreferences, onApplyPlanningPreferences, planningPreferencesForm]);

  const applyMetadataDraft = useCallback(() => {
    const result = trainingPlanMetadataFormSchema.safeParse(metadataForm.getValues());
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === "name" || issue.path[0] === "description") {
          metadataForm.setError(issue.path[0], { message: issue.message });
        }
      }
      return false;
    }
    onApplyMetadata({ ...result.data, templateVisibility: draftTemplateVisibility });
    return true;
  }, [draftTemplateVisibility, metadataForm, onApplyMetadata]);

  const value = useMemo<TrainingPlanBuilderSheetDraftsContextValue>(
    () => ({
      canResetActivityFilters:
        draftActivityPlanCategoryFilter !== null || draftActivityPlanSort !== "newest",
      canResetPlanningPreferences,
      canSavePlanningPreferences,
      canSaveMetadata,
      draftActivityPlanCategoryFilter,
      draftActivityPlanSort,
      draftPlanningConstraintFields,
      planningPreferenceIssues,
      planningPreferencesForm,
      metadataForm,
      draftTemplateVisibility,
      applyActivityFiltersDraft,
      applyPlanningPreferencesDraft,
      applyMetadataDraft,
      cancelDraftForSheet,
      cancelSheetDrafts,
      prepareActivityFiltersDraft,
      preparePlanningPreferencesDraft,
      resetActivityFiltersDraft,
      addPlanningConstraintDraft,
      updatePlanningConstraintDraft,
      setDraftTemplateVisibility,
      setDraftActivityPlanCategoryFilter,
      setDraftActivityPlanSort,
    }),
    [
      draftActivityPlanCategoryFilter,
      draftActivityPlanSort,
      draftPlanningConstraintFields,
      planningPreferenceIssues,
      planningPreferencesForm,
      canResetPlanningPreferences,
      canSavePlanningPreferences,
      canSaveMetadata,
      metadataForm,
      draftTemplateVisibility,
      applyActivityFiltersDraft,
      applyPlanningPreferencesDraft,
      applyMetadataDraft,
      cancelDraftForSheet,
      cancelSheetDrafts,
      prepareActivityFiltersDraft,
      preparePlanningPreferencesDraft,
      resetActivityFiltersDraft,
      addPlanningConstraintDraft,
      updatePlanningConstraintDraft,
    ],
  );

  return (
    <TrainingPlanBuilderSheetDraftsContext.Provider value={value}>
      {children}
    </TrainingPlanBuilderSheetDraftsContext.Provider>
  );
}

export function useTrainingPlanBuilderSheetDrafts() {
  const context = useContext(TrainingPlanBuilderSheetDraftsContext);
  if (!context) {
    throw new Error("Missing training plan builder sheet drafts provider.");
  }
  return context;
}

function TrainingPlanBuilderMetadataSheetContent() {
  const { draftTemplateVisibility, metadataForm, setDraftTemplateVisibility } =
    useTrainingPlanBuilderSheetDrafts();

  return (
    <Form {...metadataForm}>
      <View className="gap-4">
        <View className="gap-3">
          <Text className="text-sm font-semibold text-foreground">Identity</Text>
          <FormTextField
            control={metadataForm.control}
            label="Plan name"
            name="name"
            placeholder="Base builder, race prep, return to training..."
            testId="builder-plan-name-input"
          />
          <FormTextareaField
            className="min-h-24"
            control={metadataForm.control}
            label="Description"
            name="description"
            placeholder="What this plan is designed to do"
          />
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Visibility</Text>
            <View
              accessibilityLabel="Plan visibility"
              accessibilityRole="radiogroup"
              className="flex-row gap-2"
            >
              {(["private", "public"] as const).map((visibility) => {
                const selected = draftTemplateVisibility === visibility;
                const label = visibility === "public" ? "Public" : "Private";
                return (
                  <Pressable
                    accessibilityLabel={`${label} training plan`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    className={`min-h-11 flex-1 items-center justify-center rounded-xl border px-3 py-2 ${
                      selected ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    key={visibility}
                    onPress={() => setDraftTemplateVisibility(visibility)}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selected ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-xs text-muted-foreground">
              Public plans can be discovered by other athletes. Private plans remain visible only to
              you.
            </Text>
          </View>
        </View>
      </View>
    </Form>
  );
}

type TrainingPlanBuilderSheetContentProps = {
  activeSheet: BuilderSheet | null;
  activityPlanCategoryFilter: ActivityCategoryFilter;
  activityPlanEstimateById: Map<string, ActivityPlanPlanningEstimate>;
  activityPlanSearchQuery: string;
  activityPlanSort: ActivityPlanSort;
  activityPlansById: Record<string, ActivityPlan>;
  builder: TrainingPlanBuilderService;
  goBackSheet: () => void;
  onSelectActivityPlan: (activityPlan: ActivityPlan) => void;
  onRemoveSession: (sessionId: string) => void;
  pushSheet: (sheet: BuilderSheet) => void;
  selectedSessionId: string | null;
  setActivityPlanSearchQuery: Dispatch<SetStateAction<string>>;
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>;
};

export function TrainingPlanBuilderSheetContent({
  activeSheet,
  activityPlanCategoryFilter,
  activityPlanEstimateById,
  activityPlanSearchQuery,
  activityPlanSort,
  activityPlansById,
  builder,
  goBackSheet,
  onSelectActivityPlan,
  onRemoveSession,
  pushSheet,
  selectedSessionId,
  setActivityPlanSearchQuery,
  setSelectedSessionId,
}: TrainingPlanBuilderSheetContentProps) {
  const router = useRouter();
  const sheetDrafts = useTrainingPlanBuilderSheetDrafts();
  const { activityPlanItems, activityPlansQuery, state } = builder;
  const { athleteContextFields, schedulingPreview } = builder.derived;
  const selectedSession = selectedSessionId
    ? builder.actions.getSessionById(selectedSessionId)
    : null;

  if (activeSheet === "activityAssignment" && selectedSession) {
    return (
      <BuilderActivityAssignmentSheetContent
        activityPlanEstimateById={activityPlanEstimateById}
        activityPlanItems={activityPlanItems}
        activityPlanSort={activityPlanSort}
        categoryFilter={activityPlanCategoryFilter}
        hasNextPage={activityPlansQuery.hasNextPage}
        isFetchingNextPage={activityPlansQuery.isFetchingNextPage}
        isLoading={activityPlansQuery.isLoading}
        onClearSearch={() => setActivityPlanSearchQuery("")}
        onFetchNextPage={() => void activityPlansQuery.fetchNextPage()}
        onOpenFilters={() => {
          sheetDrafts.prepareActivityFiltersDraft();
          pushSheet("activityFilters");
        }}
        onSearchChange={setActivityPlanSearchQuery}
        onSelectActivityPlan={onSelectActivityPlan}
        searchQuery={activityPlanSearchQuery}
      />
    );
  }

  if (activeSheet === "activityFilters") {
    return (
      <BuilderActivityFiltersSheetContent
        draftCategoryFilter={sheetDrafts.draftActivityPlanCategoryFilter}
        draftSort={sheetDrafts.draftActivityPlanSort}
        onChangeCategoryFilter={sheetDrafts.setDraftActivityPlanCategoryFilter}
        onChangeSort={sheetDrafts.setDraftActivityPlanSort}
      />
    );
  }

  if (activeSheet === "goals") {
    return (
      <BuilderGoalEditorContent
        goalContext={state.goalContext}
        isLoadingProfileGoals={builder.profileGoalsQuery.isLoading}
        isProfileGoalsError={builder.profileGoalsQuery.isError}
        profileGoals={builder.profileGoalsQuery.goals.filter(
          (goal) => typeof goal.target_date === "string" && goal.target_date >= state.anchorDate,
        )}
        onChooseNoGoal={builder.actions.clearGoals}
        onCreateLocalGoal={() => pushSheet("localGoalCreate")}
        onCreateProfileGoal={() =>
          router.push({ pathname: "/goal-create", params: { returnToTrainingPlanCreate: "1" } })
        }
        onRemoveLocalGoal={builder.actions.removeLocalGoal}
        onRemoveSelectedGoal={(sourceProfileGoalId) =>
          builder.actions.removeSelectedGoal(sourceProfileGoalId)
        }
        onRetryProfileGoals={() => void builder.profileGoalsQuery.refetch()}
        onToggleSelectedGoal={builder.actions.toggleSelectedGoal}
      />
    );
  }

  if (activeSheet === "localGoalCreate") {
    return (
      <BuilderLocalGoalCreateContent
        planStartDate={state.scheduling.startDate}
        onSave={(goal) => {
          builder.actions.addLocalGoal(goal);
          goBackSheet();
        }}
      />
    );
  }

  if (activeSheet === "metadata") {
    return <TrainingPlanBuilderMetadataSheetContent />;
  }

  if (activeSheet === "athleteContext") {
    return (
      <BuilderAthleteContextForm
        fields={athleteContextFields}
        onAddField={(fieldKey) =>
          builder.actions.overrideAthleteContextField({ key: fieldKey, value: 0 })
        }
        onChangeField={(fieldKey, value) =>
          builder.actions.overrideAthleteContextField({ key: fieldKey, value })
        }
        onRemoveField={builder.actions.removeAthleteContextField}
      />
    );
  }

  if (activeSheet === "preferences") {
    return (
      <BuilderPlanPreferencesContextForm
        fields={sheetDrafts.draftPlanningConstraintFields}
        issues={sheetDrafts.planningPreferenceIssues}
        onAddField={sheetDrafts.addPlanningConstraintDraft}
        onChangeField={sheetDrafts.updatePlanningConstraintDraft}
        onRemoveField={(fieldKey) => sheetDrafts.updatePlanningConstraintDraft(fieldKey, null)}
      />
    );
  }

  if (activeSheet === "schedulePreview") {
    return (
      <BuilderSchedulePreviewContent
        preview={schedulingPreview}
        state={state}
        onClearSessionOverride={builder.actions.clearSessionScheduleDateOverride}
        onMoveSessionByDays={builder.actions.moveSessionByDays}
        onTogglePreferredWeekday={builder.actions.togglePreferredScheduleWeekday}
      />
    );
  }

  if (activeSheet === "session" && selectedSession) {
    return (
      <BuilderSessionEditorContent
        activityPlan={
          selectedSession.activityPlan
            ? (activityPlansById[selectedSession.activityPlan.id] ?? null)
            : null
        }
        onChange={builder.actions.updateSession}
        onDuplicate={(sessionId) => {
          const duplicate = builder.actions.duplicateSession(sessionId);
          if (duplicate) {
            setSelectedSessionId(duplicate.localId);
          }
        }}
        onOpenActivityPicker={(sessionId) => {
          setSelectedSessionId(sessionId);
          pushSheet("activityAssignment");
        }}
        onRemove={onRemoveSession}
        session={selectedSession}
      />
    );
  }

  return null;
}
