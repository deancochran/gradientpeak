import type { ActivityPlanPlanningEstimate } from "@repo/core";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
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
import { View } from "react-native";
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
import {
  trainingPlanBuilderPlanPreferencesSchema,
  trainingPlanBuilderProfileGoalDraftSchema,
} from "@/lib/training-plan-creation/schemas";
import type {
  TrainingPlanBuilderPlanPreferences,
  TrainingPlanBuilderProfileGoalDraft,
} from "@/lib/training-plan-creation/types";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";
import type { BuilderSheet } from "./BuilderSheetTypes";

type TrainingPlanBuilderService = ReturnType<typeof useTrainingPlanCreationService>;

type TrainingPlanBuilderSheetDraftsContextValue = {
  canResetActivityFilters: boolean;
  canSaveProfileGoal: boolean;
  draftActivityPlanCategoryFilter: ActivityCategoryFilter;
  draftActivityPlanSort: ActivityPlanSort;
  draftPlanningConstraintFields: TrainingPlanBuilderService["derived"]["planningConstraintFields"];
  planningPreferencesForm: UseFormReturn<TrainingPlanBuilderPlanPreferences>;
  profileGoalForm: UseFormReturn<TrainingPlanBuilderProfileGoalDraft>;
  applyActivityFiltersDraft: () => void;
  applyPlanningPreferencesDraft: () => void;
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
  saveProfileGoalDraft: (onSave: (title: string) => void) => boolean;
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
  onApplyActivityFilters: (filters: {
    categoryFilter: ActivityCategoryFilter;
    sort: ActivityPlanSort;
  }) => void;
  onApplyPlanningPreferences: (preferences: TrainingPlanBuilderPlanPreferences) => void;
};

export function TrainingPlanBuilderSheetDraftsProvider({
  activeSheet,
  activityPlanCategoryFilter,
  activityPlanSort,
  children,
  planningConstraintFields,
  planPreferences,
  onApplyActivityFilters,
  onApplyPlanningPreferences,
}: TrainingPlanBuilderSheetDraftsProviderProps) {
  const profileGoalForm = useZodForm({
    schema: trainingPlanBuilderProfileGoalDraftSchema,
    defaultValues: { title: "" },
    mode: "onChange",
  });
  const profileGoalTitle = profileGoalForm.watch("title");
  const planningPreferencesForm = useZodForm({
    schema: trainingPlanBuilderPlanPreferencesSchema,
    defaultValues: planPreferences,
    mode: "onChange",
  });
  const draftPlanningPreferences = planningPreferencesForm.watch();
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

  const resetProfileGoalDraft = useCallback(() => {
    profileGoalForm.reset({ title: "" });
  }, [profileGoalForm]);

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
      if (sheet === "profileGoalCreate") {
        resetProfileGoalDraft();
      }
      if (sheet === "preferences") {
        preparePlanningPreferencesDraft();
      }
    },
    [prepareActivityFiltersDraft, preparePlanningPreferencesDraft, resetProfileGoalDraft],
  );

  const cancelSheetDrafts = useCallback(() => {
    resetProfileGoalDraft();
    prepareActivityFiltersDraft();
    preparePlanningPreferencesDraft();
  }, [prepareActivityFiltersDraft, preparePlanningPreferencesDraft, resetProfileGoalDraft]);

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
    onApplyPlanningPreferences(
      trainingPlanBuilderPlanPreferencesSchema.parse(planningPreferencesForm.getValues()),
    );
  }, [onApplyPlanningPreferences, planningPreferencesForm]);

  const saveProfileGoalDraft = useCallback(
    (onSave: (title: string) => void) => {
      const result = trainingPlanBuilderProfileGoalDraftSchema.safeParse(
        profileGoalForm.getValues(),
      );
      if (!result.success) {
        profileGoalForm.setError("title", {
          message: result.error.issues[0]?.message ?? "Goal title is required.",
        });
        return false;
      }
      onSave(result.data.title);
      resetProfileGoalDraft();
      return true;
    },
    [profileGoalForm, resetProfileGoalDraft],
  );

  const value = useMemo<TrainingPlanBuilderSheetDraftsContextValue>(
    () => ({
      canResetActivityFilters:
        draftActivityPlanCategoryFilter !== null || draftActivityPlanSort !== "newest",
      canSaveProfileGoal: profileGoalTitle.trim().length > 0,
      draftActivityPlanCategoryFilter,
      draftActivityPlanSort,
      draftPlanningConstraintFields,
      planningPreferencesForm,
      profileGoalForm,
      applyActivityFiltersDraft,
      applyPlanningPreferencesDraft,
      cancelDraftForSheet,
      cancelSheetDrafts,
      prepareActivityFiltersDraft,
      preparePlanningPreferencesDraft,
      resetActivityFiltersDraft,
      addPlanningConstraintDraft,
      updatePlanningConstraintDraft,
      saveProfileGoalDraft,
      setDraftActivityPlanCategoryFilter,
      setDraftActivityPlanSort,
    }),
    [
      draftActivityPlanCategoryFilter,
      draftActivityPlanSort,
      draftPlanningConstraintFields,
      planningPreferencesForm,
      profileGoalForm,
      profileGoalTitle,
      applyActivityFiltersDraft,
      applyPlanningPreferencesDraft,
      cancelDraftForSheet,
      cancelSheetDrafts,
      prepareActivityFiltersDraft,
      preparePlanningPreferencesDraft,
      resetActivityFiltersDraft,
      addPlanningConstraintDraft,
      updatePlanningConstraintDraft,
      saveProfileGoalDraft,
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
  pushSheet,
  selectedSessionId,
  setActivityPlanSearchQuery,
  setSelectedSessionId,
}: TrainingPlanBuilderSheetContentProps) {
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
        profileGoals={builder.profileGoalsQuery.goals}
        onCreateLocalGoal={() => pushSheet("localGoalCreate")}
        onRemoveLocalGoal={builder.actions.removeLocalGoal}
        onRemoveSelectedGoal={(sourceProfileGoalId) =>
          builder.actions.removeSelectedGoal(sourceProfileGoalId)
        }
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

  if (activeSheet === "profileGoalCreate") {
    return (
      <Form {...sheetDrafts.profileGoalForm}>
        <View className="gap-4 pb-2">
          <FormTextField
            control={sheetDrafts.profileGoalForm.control}
            label="Goal title"
            name="title"
            placeholder="Build FTP, finish a 10K, ride consistently..."
          />
        </View>
      </Form>
    );
  }

  if (activeSheet === "metadata") {
    return (
      <View className="gap-4">
        <View className="gap-3">
          <Text className="text-sm font-semibold text-foreground">Identity</Text>
          <View className="gap-2">
            <Text className="text-xs font-medium text-muted-foreground">Plan name</Text>
            <Input
              value={state.details.name}
              onChangeText={(name) => builder.actions.updateDetails({ name })}
              placeholder="Base builder, race prep, return to training..."
            />
          </View>
          <View className="gap-2">
            <Text className="text-xs font-medium text-muted-foreground">Description</Text>
            <Input
              value={state.details.description}
              onChangeText={(description) => builder.actions.updateDetails({ description })}
              placeholder="What this plan is designed to do"
              multiline
              className="min-h-24"
            />
          </View>
        </View>
      </View>
    );
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
        onClose={() => undefined}
        onRemoveField={builder.actions.removeAthleteContextField}
      />
    );
  }

  if (activeSheet === "preferences") {
    return (
      <BuilderPlanPreferencesContextForm
        fields={sheetDrafts.draftPlanningConstraintFields}
        onAddField={sheetDrafts.addPlanningConstraintDraft}
        onChangeField={sheetDrafts.updatePlanningConstraintDraft}
        onClose={() => undefined}
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
        session={selectedSession}
      />
    );
  }

  return null;
}
