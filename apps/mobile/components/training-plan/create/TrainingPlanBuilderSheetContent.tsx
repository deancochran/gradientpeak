import type {
  ActivityPlanPlanningEstimate,
  ActivityPlanSummary,
  ContentVisibility,
  GoalEditorDraft,
  TrainingPlanPreferences,
  TrainingPlanPreferenceValidationIssue,
} from "@repo/core";
import {
  isAthletePlanningContextEditableFieldKey,
  trainingPlanPreferencesSchema,
  validateTrainingPlanPreferences,
} from "@repo/core";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UseFormReturn } from "react-hook-form";
import { Pressable, View } from "react-native";
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
import { BuilderSessionEditorContent } from "@/components/training-plan/create/BuilderSessionEditorSheetContent";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";
import type { BuilderSheet } from "./BuilderSheetTypes";
import {
  type TrainingPlanMetadataFormValues,
  trainingPlanMetadataFormSchema,
} from "./trainingPlanMetadataForm";

type TrainingPlanBuilderService = ReturnType<typeof useTrainingPlanCreationService>;

export type TrainingPlanBuilderSheetState = {
  rawDrafts: Record<string, string>;
  setRawDraft: (key: string, value: string) => void;
  localGoalDraft: GoalEditorDraft | null;
  setLocalGoalDraft: (draft: GoalEditorDraft | null) => void;
  setLocalGoalDirty: (dirty: boolean) => void;
  canResetActivityFilters: boolean;
  canResetPlanningPreferences: boolean;
  canSavePlanningPreferences: boolean;
  canSaveMetadata: boolean;
  draftActivityPlanCategoryFilter: ActivityCategoryFilter;
  draftActivityPlanSort: ActivityPlanSort;
  planningPreferenceIssues: TrainingPlanPreferenceValidationIssue[];
  planningPreferencesForm: UseFormReturn<TrainingPlanPreferences>;
  preferenceNumericDrafts: Record<string, string>;
  setPreferenceNumericDraft: (key: string, value: string) => void;
  draftPlanPreferences: TrainingPlanPreferences;
  metadataForm: UseFormReturn<TrainingPlanMetadataFormValues>;
  draftContentVisibility: ContentVisibility;
  applyActivityFiltersDraft: () => void;
  applyPlanningPreferencesDraft: () => boolean;
  applyMetadataDraft: () => boolean;
  cancelDraftForSheet: (sheet: BuilderSheet | null) => void;
  prepareActivityFiltersDraft: () => void;
  preparePlanningPreferencesDraft: () => void;
  resetActivityFiltersDraft: () => void;
  setDraftPlanPreferences: (preferences: TrainingPlanPreferences) => void;
  setDraftContentVisibility: Dispatch<SetStateAction<ContentVisibility>>;
  setDraftActivityPlanCategoryFilter: Dispatch<SetStateAction<ActivityCategoryFilter>>;
  setDraftActivityPlanSort: Dispatch<SetStateAction<ActivityPlanSort>>;
  reportNumericDraftError: (key: string, message: string | null) => void;
};

type TrainingPlanBuilderSheetStateOptions = {
  activeSheet: BuilderSheet | null;
  activityPlanCategoryFilter: ActivityCategoryFilter;
  activityPlanSort: ActivityPlanSort;
  planPreferences: TrainingPlanPreferences;
  planMetadata: {
    name: string;
    description: string;
    contentVisibility: ContentVisibility;
  };
  onApplyActivityFilters: (filters: {
    categoryFilter: ActivityCategoryFilter;
    sort: ActivityPlanSort;
  }) => void;
  onApplyPlanningPreferences: (preferences: TrainingPlanPreferences) => void;
  onApplyMetadata: (
    metadata: TrainingPlanMetadataFormValues & { contentVisibility: ContentVisibility },
  ) => void;
  onNumericDraftError?: (key: string, message: string | null) => void;
};

// In-memory state for one open sheet stack. Pass it explicitly through the
// bottom-sheet portal, which renders outside the calling subtree's context.
export function useTrainingPlanBuilderSheetState({
  activeSheet,
  activityPlanCategoryFilter,
  activityPlanSort,
  planPreferences,
  planMetadata,
  onApplyActivityFilters,
  onApplyPlanningPreferences,
  onApplyMetadata,
  onNumericDraftError = () => undefined,
}: TrainingPlanBuilderSheetStateOptions) {
  const [rawDrafts, setRawDrafts] = useState<Record<string, string>>({});
  const setRawDraft = useCallback(
    (key: string, value: string) => setRawDrafts((current) => ({ ...current, [key]: value })),
    [],
  );
  const [localGoalDraft, setLocalGoalDraft] = useState<GoalEditorDraft | null>(null);
  const [localGoalDirty, setLocalGoalDirty] = useState(false);
  const metadataForm = useZodForm({
    schema: trainingPlanMetadataFormSchema,
    defaultValues: { name: planMetadata.name, description: planMetadata.description },
    mode: "onChange",
  });
  const [draftContentVisibility, setDraftContentVisibility] = useState(
    planMetadata.contentVisibility,
  );
  const metadataBaseline = useRef(planMetadata);
  const planningPreferencesForm = useZodForm({
    schema: trainingPlanPreferencesSchema,
    defaultValues: planPreferences,
    mode: "onChange",
  }) as UseFormReturn<TrainingPlanPreferences>;
  const draftPlanningPreferences = trainingPlanPreferencesSchema.parse(
    planningPreferencesForm.watch(),
  );
  const planningPreferenceIssues = useMemo(
    () => validateTrainingPlanPreferences(draftPlanningPreferences),
    [draftPlanningPreferences],
  );
  const [preferenceNumericErrors, setPreferenceNumericErrors] = useState<Record<string, string>>(
    {},
  );
  // Raw text belongs to the same transaction as parsed preferences, including explicit Revert.
  const [preferenceNumericDrafts, setPreferenceNumericDrafts] = useState<Record<string, string>>(
    {},
  );
  const setPreferenceNumericDraft = useCallback((key: string, value: string) => {
    setPreferenceNumericDrafts((current) => ({ ...current, [key]: value }));
  }, []);
  const canResetPlanningPreferences =
    planningPreferencesForm.formState.isDirty || Object.keys(preferenceNumericDrafts).length > 0;
  const reportPreferenceNumericDraftError = useCallback(
    (key: string, message: string | null) => {
      setPreferenceNumericErrors((current) => {
        if (message === null) {
          if (!(key in current)) return current;
          const { [key]: _removed, ...next } = current;
          return next;
        }
        return current[key] === message ? current : { ...current, [key]: message };
      });
      onNumericDraftError(`preferences:${key}`, message);
    },
    [onNumericDraftError],
  );
  const canSavePlanningPreferences =
    planningPreferenceIssues.length === 0 && Object.keys(preferenceNumericErrors).length === 0;
  const metadataValues = metadataForm.watch();
  const metadataDirty =
    metadataForm.formState.isDirty ||
    draftContentVisibility !== metadataBaseline.current.contentVisibility;
  useEffect(() => {
    onNumericDraftError(
      "sheet:metadata",
      metadataDirty ? "Apply or discard the plan settings edits before saving." : null,
    );
    onNumericDraftError(
      "sheet:preferences",
      canResetPlanningPreferences ? "Apply or discard the preference edits before saving." : null,
    );
    onNumericDraftError(
      "sheet:localGoal",
      localGoalDirty ? "Add or discard the new goal before saving." : null,
    );
  }, [metadataDirty, canResetPlanningPreferences, localGoalDirty, onNumericDraftError]);
  const canSaveMetadata = trainingPlanMetadataFormSchema.safeParse(metadataValues).success;
  const [draftActivityPlanCategoryFilter, setDraftActivityPlanCategoryFilter] =
    useState<ActivityCategoryFilter>(activityPlanCategoryFilter);
  const [draftActivityPlanSort, setDraftActivityPlanSort] = useState(activityPlanSort);

  const prepareMetadataDraft = useCallback(() => {
    metadataBaseline.current = {
      name: planMetadata.name,
      description: planMetadata.description,
      contentVisibility: planMetadata.contentVisibility,
    };
    metadataForm.reset({ name: planMetadata.name, description: planMetadata.description });
    setDraftContentVisibility(planMetadata.contentVisibility);
  }, [metadataForm, planMetadata.description, planMetadata.name, planMetadata.contentVisibility]);

  const prepareActivityFiltersDraft = useCallback(() => {
    setDraftActivityPlanCategoryFilter(activityPlanCategoryFilter);
    setDraftActivityPlanSort(activityPlanSort);
  }, [activityPlanCategoryFilter, activityPlanSort]);

  const preparePlanningPreferencesDraft = useCallback(() => {
    planningPreferencesForm.reset(planPreferences);
    setPreferenceNumericDrafts({});
    for (const key of Object.keys(preferenceNumericErrors)) {
      reportPreferenceNumericDraftError(key, null);
    }
  }, [
    planPreferences,
    planningPreferencesForm,
    preferenceNumericErrors,
    reportPreferenceNumericDraftError,
  ]);

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
      if (sheet === "localGoalCreate") {
        setLocalGoalDraft(null);
        setLocalGoalDirty(false);
      }
    },
    [prepareActivityFiltersDraft, prepareMetadataDraft, preparePlanningPreferencesDraft],
  );

  const applyActivityFiltersDraft = useCallback(() => {
    onApplyActivityFilters({
      categoryFilter: draftActivityPlanCategoryFilter,
      sort: draftActivityPlanSort,
    });
  }, [draftActivityPlanCategoryFilter, draftActivityPlanSort, onApplyActivityFilters]);

  const setPlanningPreferencesDraft = useCallback(
    (preferences: TrainingPlanPreferences) => {
      planningPreferencesForm.reset(trainingPlanPreferencesSchema.parse(preferences), {
        keepDefaultValues: true,
      });
    },
    [planningPreferencesForm],
  );

  const applyPlanningPreferencesDraft = useCallback(() => {
    if (!canSavePlanningPreferences) {
      return false;
    }
    const saved = trainingPlanPreferencesSchema.parse(planningPreferencesForm.getValues());
    onApplyPlanningPreferences(saved);
    planningPreferencesForm.reset(saved);
    setPreferenceNumericDrafts({});
    return true;
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
    onApplyMetadata({ ...result.data, contentVisibility: draftContentVisibility });
    metadataBaseline.current = { ...result.data, contentVisibility: draftContentVisibility };
    metadataForm.reset(result.data);
    return true;
  }, [draftContentVisibility, metadataForm, onApplyMetadata]);

  const previousSheet = useRef<BuilderSheet | null>(null);
  useEffect(() => {
    if (previousSheet.current === activeSheet) return;
    previousSheet.current = activeSheet;
    if (activeSheet === "activityFilters") prepareActivityFiltersDraft();
    if (activeSheet === "metadata") prepareMetadataDraft();
    if (activeSheet === "preferences") preparePlanningPreferencesDraft();
  }, [
    activeSheet,
    prepareActivityFiltersDraft,
    prepareMetadataDraft,
    preparePlanningPreferencesDraft,
  ]);

  return useMemo<TrainingPlanBuilderSheetState>(
    () => ({
      rawDrafts,
      setRawDraft,
      localGoalDraft,
      setLocalGoalDraft,
      setLocalGoalDirty,
      canResetActivityFilters:
        draftActivityPlanCategoryFilter !== null || draftActivityPlanSort !== "newest",
      canResetPlanningPreferences,
      canSavePlanningPreferences,
      canSaveMetadata,
      draftActivityPlanCategoryFilter,
      draftActivityPlanSort,
      draftPlanningPreferences,
      planningPreferenceIssues,
      planningPreferencesForm,
      preferenceNumericDrafts,
      setPreferenceNumericDraft,
      draftPlanPreferences: draftPlanningPreferences,
      metadataForm,
      draftContentVisibility,
      applyActivityFiltersDraft,
      applyPlanningPreferencesDraft,
      applyMetadataDraft,
      cancelDraftForSheet,
      prepareActivityFiltersDraft,
      preparePlanningPreferencesDraft,
      resetActivityFiltersDraft,
      setDraftPlanPreferences: setPlanningPreferencesDraft,
      reportNumericDraftError: reportPreferenceNumericDraftError,
      setDraftContentVisibility,
      setDraftActivityPlanCategoryFilter,
      setDraftActivityPlanSort,
    }),
    [
      rawDrafts,
      setRawDraft,
      localGoalDraft,
      draftActivityPlanCategoryFilter,
      draftActivityPlanSort,
      draftPlanningPreferences,
      planningPreferenceIssues,
      planningPreferencesForm,
      preferenceNumericDrafts,
      setPreferenceNumericDraft,
      canResetPlanningPreferences,
      canSavePlanningPreferences,
      canSaveMetadata,
      metadataForm,
      draftContentVisibility,
      applyActivityFiltersDraft,
      applyPlanningPreferencesDraft,
      applyMetadataDraft,
      cancelDraftForSheet,
      prepareActivityFiltersDraft,
      preparePlanningPreferencesDraft,
      resetActivityFiltersDraft,
      setPlanningPreferencesDraft,
      reportPreferenceNumericDraftError,
    ],
  );
}

function TrainingPlanBuilderMetadataSheetContent({
  sheetState,
}: {
  sheetState: TrainingPlanBuilderSheetState;
}) {
  const { draftContentVisibility, metadataForm, setDraftContentVisibility } = sheetState;

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
              {(["private", "followers", "public"] as const).map((visibility) => {
                const selected = draftContentVisibility === visibility;
                const label =
                  visibility === "public"
                    ? "Public"
                    : visibility === "followers"
                      ? "Followers"
                      : "Private";
                return (
                  <Pressable
                    accessibilityLabel={`${label} training plan`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    className={`min-h-11 flex-1 items-center justify-center rounded-xl border px-3 py-2 ${
                      selected ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    key={visibility}
                    onPress={() => setDraftContentVisibility(visibility)}
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
              Public plans can be discovered by anyone. Followers plans are shared with followers;
              private plans remain visible only to you.
            </Text>
          </View>
        </View>
      </View>
    </Form>
  );
}

type TrainingPlanBuilderSheetContentProps = {
  sheetState: TrainingPlanBuilderSheetState;
  activeSheet: BuilderSheet | null;
  activityPlanCategoryFilter: ActivityCategoryFilter;
  activityPlanEstimateById: Map<string, ActivityPlanPlanningEstimate>;
  activityPlanSearchQuery: string;
  activityPlanSort: ActivityPlanSort;
  activityPlansById: Record<string, ActivityPlanSummary>;
  builder: TrainingPlanBuilderService;
  goBackSheet: () => void;
  onSelectActivityPlan: (activityPlan: ActivityPlanSummary) => void;
  onRemoveSession: (sessionId: string) => void;
  onNumericDraftError: (key: string, message: string | null) => void;
  pushSheet: (sheet: BuilderSheet) => void;
  selectedSessionId: string | null;
  setActivityPlanSearchQuery: Dispatch<SetStateAction<string>>;
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>;
};

export function TrainingPlanBuilderSheetContent({
  sheetState: sheetDrafts,
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
  onNumericDraftError,
  pushSheet,
  selectedSessionId,
  setActivityPlanSearchQuery,
  setSelectedSessionId,
}: TrainingPlanBuilderSheetContentProps) {
  const router = useRouter();
  const { activityPlanItems, activityPlansQuery, state } = builder;
  const { athleteContextFields } = builder.derived;
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
        draft={sheetDrafts.localGoalDraft ?? undefined}
        onDraftChange={sheetDrafts.setLocalGoalDraft}
        onDirtyChange={sheetDrafts.setLocalGoalDirty}
        planStartDate={state.scheduling.startDate}
        onSave={(goal) => {
          builder.actions.addLocalGoal(goal);
          sheetDrafts.cancelDraftForSheet("localGoalCreate");
          goBackSheet();
        }}
      />
    );
  }

  if (activeSheet === "metadata") {
    return <TrainingPlanBuilderMetadataSheetContent sheetState={sheetDrafts} />;
  }

  if (activeSheet === "athleteContext") {
    return (
      <BuilderAthleteContextForm
        rawDrafts={Object.fromEntries(
          Object.entries(sheetDrafts.rawDrafts)
            .filter(([key]) => key.startsWith("athlete:"))
            .map(([key, value]) => [key.slice(8), value]),
        )}
        onRawDraftChange={(key, value) => sheetDrafts.setRawDraft(`athlete:${key}`, value)}
        onInvalidChange={(key, message) => onNumericDraftError(`athlete:${key}`, message)}
        fields={athleteContextFields}
        onAddField={(fieldKey) => {
          if (isAthletePlanningContextEditableFieldKey(fieldKey))
            builder.actions.overrideAthleteContextField({ key: fieldKey, value: 0 });
        }}
        onChangeField={(fieldKey, value) => {
          if (isAthletePlanningContextEditableFieldKey(fieldKey))
            builder.actions.overrideAthleteContextField({ key: fieldKey, value });
        }}
        onRemoveField={(fieldKey) => {
          sheetDrafts.setRawDraft(`athlete:${fieldKey}`, "");
          onNumericDraftError(`athlete:${fieldKey}`, null);
          if (isAthletePlanningContextEditableFieldKey(fieldKey))
            builder.actions.removeAthleteContextField(fieldKey);
        }}
      />
    );
  }

  if (activeSheet === "preferences") {
    return (
      <BuilderPlanPreferencesContextForm
        disabled={builder.derived.savePlan.isPending}
        numericDrafts={sheetDrafts.preferenceNumericDrafts}
        onNumericDraftChange={sheetDrafts.setPreferenceNumericDraft}
        issues={sheetDrafts.planningPreferenceIssues}
        preferences={sheetDrafts.draftPlanPreferences}
        onChange={sheetDrafts.setDraftPlanPreferences}
        onNumericDraftError={sheetDrafts.reportNumericDraftError}
      />
    );
  }

  if (activeSheet === "session" && selectedSession) {
    return (
      <BuilderSessionEditorContent
        key={selectedSession.localId}
        rawDrafts={sheetDrafts.rawDrafts}
        onRawDraftChange={sheetDrafts.setRawDraft}
        activityPlan={
          selectedSession.activityPlan
            ? (activityPlansById[selectedSession.activityPlan.id] ?? null)
            : null
        }
        onChange={builder.actions.updateSession}
        onNumericDraftError={onNumericDraftError}
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
