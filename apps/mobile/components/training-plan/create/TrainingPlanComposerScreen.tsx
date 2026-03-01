import {
  type GoalTargetFormData,
  SinglePageForm,
  type TrainingPlanConfigConflict,
  type TrainingPlanConfigFormData,
  type TrainingPlanFormData,
  type TrainingPlanMetadataFormData,
} from "@/components/training-plan/create/SinglePageForm";
import { featureFlags } from "@/lib/constants/features";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import {
  buildMinimalTrainingPlanPayload,
  toCreationNormalizationInput,
  toTrainingPlanConfigFormDataFromStructure,
  toTrainingPlanFormDataFromStructure,
} from "@/lib/training-plan-form/adapters";
import {
  getTopBlockingIssues,
  trainingPlanFormSchema,
} from "@/lib/training-plan-form/validation";
import {
  hasBehaviorControlsChanged,
  shouldApplyBehaviorControlSuggestions,
} from "@/lib/training-plan-form/behaviorControlsState";
import { computeLocalCreationPreview } from "@/lib/training-plan-form/localPreview";
import { mapTrainingPlanSaveError } from "@/lib/training-plan-form/saveErrorMapping";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  nextPendingPreviewCount,
  shouldIgnorePreviewResponse,
} from "@/lib/training-plan-form/previewRequestState";
import { trpc } from "@/lib/trpc";
import { Text } from "@/components/ui/text";
import {
  buildPreviewMinimalPlanFromForm,
  reducePreviewState,
  trainingPlanCalibrationConfigSchema,
} from "@repo/core";
import type {
  CreationAvailabilityConfig,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  CreationProvenance,
  CreationValueSource,
  PreviewState,
  ProjectionChartPayload,
  ReadinessDeltaDiagnostics,
} from "@repo/core";
import { Stack, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FieldError,
  type FieldErrors,
  useForm,
  useWatch,
} from "react-hook-form";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

export type TrainingPlanComposerModeContract =
  | {
      mode: "create";
      planId?: never;
    }
  | {
      mode: "edit";
      planId: string;
    };

export type TrainingPlanComposerInitialTab =
  | "plan"
  | "goals"
  | "availability"
  | "constraints"
  | "calibration"
  | "review";

type TrainingPlanComposerScreenProps = TrainingPlanComposerModeContract & {
  initialTab?: TrainingPlanComposerInitialTab;
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

function assertModeContract(contract: TrainingPlanComposerModeContract): void {
  if (contract.mode === "edit" && !isUuid(contract.planId)) {
    throw new Error("Training plan edit mode requires a valid plan id.");
  }
}

const HIGH_IMPACT_RECOMPUTE_DELAY_MS = 500;
const PREVIEW_REFRESH_DELAY_MS = 350;
const TRAINING_PLAN_HIERARCHY_EXPLAINER_DISMISS_KEY =
  "training-plan-hierarchy-explainer-dismissed-v1";

const weekDays: CreationAvailabilityConfig["days"][number]["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const createLocalId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultTarget = (): GoalTargetFormData => ({
  id: createLocalId(),
  targetType: "race_performance",
  activityCategory: "run",
});

const createDefaultGoal = (targetDate: string) => ({
  id: createLocalId(),
  name: "",
  targetDate,
  priority: 1,
  targets: [createDefaultTarget()],
});

const areJsonStructurallyEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left) === JSON.stringify(right);
};

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isFieldError = (value: unknown): value is FieldError => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return "message" in value || "type" in value;
};

const flattenFormErrors = (
  errors: FieldErrors<TrainingPlanFormData>,
): Record<string, string> => {
  const flattened: Record<string, string> = {};

  const walk = (node: unknown, path: string) => {
    if (!node) {
      return;
    }

    if (isFieldError(node) && typeof node.message === "string" && path) {
      flattened[path] = node.message;
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, path ? `${path}.${index}` : String(index));
      });
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (key === "root") {
        if (isFieldError(value) && typeof value.message === "string" && path) {
          flattened[path] = value.message;
        }
        return;
      }

      walk(value, path ? `${path}.${key}` : key);
    });
  };

  walk(errors, "");
  return flattened;
};

const createDefaultAvailability = (): CreationAvailabilityConfig => ({
  template: "custom",
  days: weekDays.map((day) => ({
    day,
    windows:
      day === "wednesday" ||
      day === "friday" ||
      day === "saturday" ||
      day === "sunday"
        ? [{ start_minute_of_day: 360, end_minute_of_day: 450 }]
        : [],
    max_sessions:
      day === "wednesday" ||
      day === "friday" ||
      day === "saturday" ||
      day === "sunday"
        ? 1
        : 0,
  })),
});

const createProvenance = (
  source: CreationValueSource,
  rationale: string[] = [],
): CreationProvenance => ({
  source,
  confidence: source === "user" ? null : 0,
  rationale,
  references: [],
  updated_at: new Date().toISOString(),
});

const createDefaultConfigState = (): TrainingPlanConfigFormData => ({
  availabilityConfig: createDefaultAvailability(),
  availabilityProvenance: createProvenance("default", ["initial_default"]),
  recentInfluenceScore: 0,
  recentInfluenceAction: "disabled",
  recentInfluenceProvenance: createProvenance("default", ["initial_default"]),
  constraints: {
    hard_rest_days: ["monday", "tuesday", "thursday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "balanced",
  },
  optimizationProfile: "balanced",
  postGoalRecoveryDays: 5,
  behaviorControlsV1: {
    aggressiveness: 0.5,
    variability: 0.5,
    spike_frequency: 0.35,
    shape_target: 0,
    shape_strength: 0.35,
    recovery_priority: 0.6,
    starting_fitness_confidence: 0.6,
  },
  startingCtlAssumption: undefined,
  startingFatigueState: undefined,
  calibration: trainingPlanCalibrationConfigSchema.parse({}),
  calibrationCompositeLocks: {
    target_attainment_weight: false,
    envelope_weight: false,
    durability_weight: false,
    evidence_weight: false,
  },
  constraintsSource: "default",
  locks: {
    availability_config: { locked: false },
    recent_influence: { locked: false },
    hard_rest_days: { locked: false },
    min_sessions_per_week: { locked: false },
    max_sessions_per_week: { locked: false },
    max_single_session_duration_minutes: { locked: false },
    goal_difficulty_preference: { locked: false },
    optimization_profile: { locked: false },
    post_goal_recovery_days: { locked: false },
    behavior_controls_v1: { locked: false },
  },
});

export function TrainingPlanComposerScreen(
  contract: TrainingPlanComposerScreenProps,
) {
  assertModeContract(contract);

  const isEditMode = contract.mode === "edit";
  const router = useRouter();
  const utils = trpc.useUtils();

  const defaultTargetDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 112);
    return date.toISOString().split("T")[0]!;
  }, []);

  const defaultFormData = useMemo<TrainingPlanFormData>(
    () => ({
      planStartDate: undefined,
      goals: [createDefaultGoal(defaultTargetDate)],
    }),
    [defaultTargetDate],
  );

  const form = useForm<TrainingPlanFormData>({
    resolver: zodResolver(trainingPlanFormSchema),
    defaultValues: defaultFormData,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const watchedFormData = useWatch({ control: form.control });
  const formData = (watchedFormData ??
    form.getValues()) as TrainingPlanFormData;
  const errors = useMemo(
    () => flattenFormErrors(form.formState.errors),
    [form.formState.errors],
  );

  const [configData, setConfigData] = useState<TrainingPlanConfigFormData>(
    createDefaultConfigState,
  );
  const [planMetadata, setPlanMetadata] =
    useState<TrainingPlanMetadataFormData>(() => ({
      name: "New Training Plan",
      description: "",
      isActive: true,
    }));
  const [hasHydratedFromEditPlan, setHasHydratedFromEditPlan] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreviewPending, setIsPreviewPending] = useState(false);
  const [hasSeededDefaults, setHasSeededDefaults] = useState(false);
  const [dirtyState, setDirtyState] = useState({
    availability: false,
    recent: false,
    constraints: false,
    behaviorControls: false,
  });
  const [contextSummary, setContextSummary] = useState<
    CreationContextSummary | undefined
  >(undefined);
  const [feasibilitySummary, setFeasibilitySummary] = useState<
    CreationFeasibilitySafetySummary | undefined
  >(undefined);
  const [conflictItems, setConflictItems] = useState<
    TrainingPlanConfigConflict[]
  >([]);
  const [previewState, setPreviewState] = useState<
    PreviewState<ProjectionChartPayload>
  >({});
  const [readinessDeltaDiagnostics, setReadinessDeltaDiagnostics] = useState<
    ReadinessDeltaDiagnostics | undefined
  >(undefined);
  const [informationalConflicts, setInformationalConflicts] = useState<
    string[]
  >([]);
  const [showHierarchyExplainer, setShowHierarchyExplainer] = useState(false);
  const [allowBlockingIssueOverride, setAllowBlockingIssueOverride] =
    useState(false);
  const [recomputeNonce, setRecomputeNonce] = useState(0);
  const lastHandledRecomputeNonceRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const latestAppliedPreviewRequestIdRef = useRef(0);
  const previewPendingRequestCountRef = useRef(0);
  const previewBaselineSnapshotRef = useRef<
    Parameters<typeof computeLocalCreationPreview>[0]["previewBaseline"] | null
  >(null);
  const scheduledPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activePreviewCancellationRef = useRef<(() => void) | null>(null);
  const initializedFormDefaultsRef = useRef<TrainingPlanFormData | null>(null);
  const initializedConfigDefaultsRef =
    useRef<TrainingPlanConfigFormData | null>(null);

  const editPlanQuery = trpc.trainingPlans.get.useQuery(
    isEditMode ? { id: contract.planId } : undefined,
    {
      enabled: isEditMode,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const blockingIssues = useMemo(
    () =>
      getTopBlockingIssues({
        conflictItems,
        feasibilitySafetySummary: feasibilitySummary,
      }),
    [conflictItems, feasibilitySummary],
  );
  const hasBlockingIssues = blockingIssues.length > 0;
  const isCreateBlockedByPolicy =
    featureFlags.trainingPlanCreateConfigMvp &&
    hasBlockingIssues &&
    !allowBlockingIssueOverride;
  const canCreatePlan = !isCreating && !isCreateBlockedByPolicy;

  const suggestionsQuery = trpc.trainingPlans.getCreationSuggestions.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      enabled: featureFlags.trainingPlanCreateConfigMvp && !isEditMode,
    },
  );
  const getCreationSuggestionsQuery =
    utils.client.trainingPlans.getCreationSuggestions.query;
  type CreationSuggestionsResponse = Awaited<
    ReturnType<typeof getCreationSuggestionsQuery>
  >;

  const createPlanLegacyMutation = useReliableMutation(
    trpc.trainingPlans.createFromMinimalGoal,
    {
      invalidate: [utils.trainingPlans],
      onError: (error) => {
        const errorMessage = error.message || "Failed to create training plan.";
        Alert.alert("Error", errorMessage, [{ text: "OK" }]);
        setIsCreating(false);
      },
    },
  );

  const createPlanMutation = useReliableMutation(
    trpc.trainingPlans.createFromCreationConfig,
    {
      invalidate: [utils.trainingPlans],
      onError: (error) => {
        const mapped = mapTrainingPlanSaveError(error);
        Alert.alert("Error", mapped.message, [{ text: "OK" }]);
        setIsCreating(false);
      },
    },
  );

  const updatePlanMutation = useReliableMutation(
    trpc.trainingPlans.updateFromCreationConfig,
    {
      invalidate: [utils.trainingPlans],
      onError: (error) => {
        const mapped = mapTrainingPlanSaveError(error);
        Alert.alert("Error", mapped.message, [{ text: "OK" }]);
        setIsCreating(false);
      },
    },
  );

  const updatePlanMetadataMutation = useReliableMutation(
    trpc.trainingPlans.update,
    {
      invalidate: [utils.trainingPlans],
      onError: (error) => {
        Alert.alert(
          "Error",
          error.message || "Failed to update training plan.",
          [{ text: "OK" }],
        );
      },
    },
  );

  const buildMinimalPayload = useCallback(
    () =>
      buildMinimalTrainingPlanPayload({
        planStartDate: formData.planStartDate,
        goals: formData.goals,
      }),
    [formData.goals, formData.planStartDate],
  );

  const buildCreationInput = toCreationNormalizationInput;

  const resolveStartingAtlOverride = (
    config: TrainingPlanConfigFormData,
  ): number | undefined => {
    if (typeof config.startingCtlAssumption !== "number") {
      return undefined;
    }

    const offset =
      config.startingFatigueState === "fresh"
        ? -6
        : config.startingFatigueState === "fatigued"
          ? 8
          : 0;
    return Number(
      Math.max(0, Math.min(200, config.startingCtlAssumption + offset)).toFixed(
        1,
      ),
    );
  };

  const mergeSuggestionsIntoConfig = useCallback(
    (
      current: TrainingPlanConfigFormData,
      suggestionResponse: CreationSuggestionsResponse,
      mode: "seed" | "recompute",
    ): TrainingPlanConfigFormData => {
      const suggestions = suggestionResponse.suggestions;
      const next = { ...current };

      const canApplyAvailability =
        mode === "seed" ||
        (!dirtyState.availability && !current.locks.availability_config.locked);
      if (canApplyAvailability) {
        next.availabilityConfig = suggestions.availability_config;
        next.availabilityProvenance = suggestions.availability_provenance;
      }

      const canApplyRecent =
        mode === "seed" ||
        (!dirtyState.recent && !current.locks.recent_influence.locked);
      if (canApplyRecent) {
        next.recentInfluenceScore =
          suggestions.recent_influence.influence_score;
        next.recentInfluenceAction = suggestions.recent_influence_action;
        next.recentInfluenceProvenance =
          suggestions.recent_influence_provenance;
      }

      const canApplyConstraints = mode === "seed" || !dirtyState.constraints;
      if (canApplyConstraints) {
        next.constraints = suggestions.constraints;
        next.constraintsSource = "suggested";
      }

      const canApplyBehaviorControls = shouldApplyBehaviorControlSuggestions({
        mode,
        locked: current.locks.behavior_controls_v1.locked,
        dirty: dirtyState.behaviorControls,
      });
      if (canApplyBehaviorControls) {
        const suggestedBehaviorControls = (
          suggestions as {
            behavior_controls_v1?: TrainingPlanConfigFormData["behaviorControlsV1"];
          }
        ).behavior_controls_v1;
        if (suggestedBehaviorControls) {
          next.behaviorControlsV1 = suggestedBehaviorControls;
        }
      }

      setInformationalConflicts(suggestions.locked_conflicts ?? []);
      setContextSummary(suggestionResponse.context_summary);

      return next;
    },
    [dirtyState],
  );

  const refreshPreview = useCallback(async () => {
    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    const previewMinimalPlan = buildPreviewMinimalPlanFromForm(formData);
    if (!previewMinimalPlan) {
      previewBaselineSnapshotRef.current = null;
      setReadinessDeltaDiagnostics(undefined);
      setPreviewState((previous) =>
        reducePreviewState(previous, {
          status: "failure",
          errorMessage: "",
        }),
      );
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    if (activePreviewCancellationRef.current) {
      activePreviewCancellationRef.current();
    }

    let cancelled = false;
    activePreviewCancellationRef.current = () => {
      cancelled = true;
    };

    previewPendingRequestCountRef.current = nextPendingPreviewCount({
      pendingCount: previewPendingRequestCountRef.current,
      delta: 1,
    });
    setIsPreviewPending(true);

    try {
      const preview = await Promise.resolve(
        computeLocalCreationPreview({
          minimalPlan: previewMinimalPlan,
          creationInput: buildCreationInput(configData),
          contextSummary,
          startingCtlOverride: configData.startingCtlAssumption,
          startingAtlOverride: resolveStartingAtlOverride(configData),
          previewBaseline: previewBaselineSnapshotRef.current ?? undefined,
        }),
      );

      if (
        shouldIgnorePreviewResponse({
          requestId,
          latestAppliedRequestId: latestAppliedPreviewRequestIdRef.current,
          cancelled,
        })
      ) {
        return;
      }
      latestAppliedPreviewRequestIdRef.current = requestId;

      if (preview.feasibilitySummary) {
        setFeasibilitySummary(preview.feasibilitySummary);
      }
      setReadinessDeltaDiagnostics(preview.readinessDeltaDiagnostics);
      previewBaselineSnapshotRef.current = preview.previewSnapshotBaseline;
      setPreviewState((previous) =>
        reducePreviewState(previous, {
          status: "success",
          projectionChart: preview.projectionChart,
        }),
      );

      const previewStartingState =
        preview.projectionChart.constraint_summary?.starting_state;
      if (previewStartingState) {
        setConfigData((previous) => {
          const nextCtl =
            previous.startingCtlAssumption ??
            Number(previewStartingState.starting_ctl.toFixed(1));
          const nextFatigueState =
            previous.startingFatigueState ??
            (previewStartingState.starting_tsb > 5
              ? "fresh"
              : previewStartingState.starting_tsb < -5
                ? "fatigued"
                : "normal");

          if (
            previous.startingCtlAssumption === nextCtl &&
            previous.startingFatigueState === nextFatigueState
          ) {
            return previous;
          }

          return {
            ...previous,
            startingCtlAssumption: nextCtl,
            startingFatigueState: nextFatigueState,
          };
        });
      }

      const nextConflicts: TrainingPlanConfigConflict[] = preview.conflicts.map(
        (conflict) => ({
          code: conflict.code,
          severity: conflict.severity,
          message: conflict.message,
          suggestions: conflict.suggestions,
        }),
      );
      setConflictItems(nextConflicts);

      return;
    } catch {
      if (
        shouldIgnorePreviewResponse({
          requestId,
          latestAppliedRequestId: latestAppliedPreviewRequestIdRef.current,
          cancelled,
        })
      ) {
        return;
      }

      setReadinessDeltaDiagnostics(undefined);
      previewBaselineSnapshotRef.current = null;
      setPreviewState((previous) =>
        reducePreviewState(previous, {
          status: "failure",
          errorMessage:
            "Could not compute the local projection preview. Review inputs and retry.",
        }),
      );
      return;
    } finally {
      previewPendingRequestCountRef.current = nextPendingPreviewCount({
        pendingCount: previewPendingRequestCountRef.current,
        delta: -1,
      });
      setIsPreviewPending(previewPendingRequestCountRef.current > 0);
    }
  }, [buildCreationInput, configData, contextSummary, formData]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    if (!editPlanQuery.data || hasHydratedFromEditPlan) {
      return;
    }

    form.reset(
      toTrainingPlanFormDataFromStructure({
        structure: editPlanQuery.data.structure,
      }),
    );
    setConfigData(
      toTrainingPlanConfigFormDataFromStructure({
        structure: editPlanQuery.data.structure,
      }),
    );
    setPlanMetadata({
      name: editPlanQuery.data.name,
      description: editPlanQuery.data.description ?? "",
      isActive: editPlanQuery.data.is_active,
    });
    setHasHydratedFromEditPlan(true);
    setHasSeededDefaults(true);
  }, [editPlanQuery.data, form, hasHydratedFromEditPlan, isEditMode]);

  useEffect(() => {
    if (!featureFlags.trainingPlanCreateConfigMvp || hasSeededDefaults) {
      return;
    }

    if (isEditMode) {
      return;
    }

    if (suggestionsQuery.data) {
      setConfigData((previous) =>
        mergeSuggestionsIntoConfig(previous, suggestionsQuery.data, "seed"),
      );
      setHasSeededDefaults(true);
      return;
    }

    if (!suggestionsQuery.isLoading && !suggestionsQuery.isFetching) {
      setHasSeededDefaults(true);
    }
  }, [
    hasSeededDefaults,
    isEditMode,
    mergeSuggestionsIntoConfig,
    suggestionsQuery.data,
    suggestionsQuery.isFetching,
    suggestionsQuery.isLoading,
  ]);

  useEffect(() => {
    if (!hasSeededDefaults || recomputeNonce === 0) {
      return;
    }

    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    if (lastHandledRecomputeNonceRef.current === recomputeNonce) {
      return;
    }
    lastHandledRecomputeNonceRef.current = recomputeNonce;

    const timer = setTimeout(async () => {
      try {
        const suggestions = await getCreationSuggestionsQuery({
          locks: configData.locks,
          existing_values: {
            availability_config: configData.availabilityConfig,
            recent_influence: {
              influence_score: configData.recentInfluenceScore,
            },
            behavior_controls_v1: configData.behaviorControlsV1,
            constraints: configData.constraints,
          },
        });

        setConfigData((previous) =>
          mergeSuggestionsIntoConfig(previous, suggestions, "recompute"),
        );
      } catch {
        // Keep user-edited values intact if recompute fails.
      }
    }, HIGH_IMPACT_RECOMPUTE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    configData.availabilityConfig,
    configData.constraints,
    configData.locks,
    configData.behaviorControlsV1,
    configData.recentInfluenceScore,
    configData.recentInfluenceAction,
    hasSeededDefaults,
    mergeSuggestionsIntoConfig,
    recomputeNonce,
    getCreationSuggestionsQuery,
  ]);

  useEffect(() => {
    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    if (!hasSeededDefaults) {
      return;
    }

    if (scheduledPreviewTimerRef.current) {
      clearTimeout(scheduledPreviewTimerRef.current);
    }

    scheduledPreviewTimerRef.current = setTimeout(() => {
      void refreshPreview();
    }, PREVIEW_REFRESH_DELAY_MS);

    return () => {
      if (scheduledPreviewTimerRef.current) {
        clearTimeout(scheduledPreviewTimerRef.current);
        scheduledPreviewTimerRef.current = null;
      }
    };
  }, [configData, hasSeededDefaults, refreshPreview]);

  useEffect(() => {
    return () => {
      if (scheduledPreviewTimerRef.current) {
        clearTimeout(scheduledPreviewTimerRef.current);
      }
      if (activePreviewCancellationRef.current) {
        activePreviewCancellationRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (isEditMode) {
      setShowHierarchyExplainer(false);
      return;
    }

    AsyncStorage.getItem(TRAINING_PLAN_HIERARCHY_EXPLAINER_DISMISS_KEY)
      .then((value) => {
        if (!value) {
          setShowHierarchyExplainer(true);
        }
      })
      .catch(() => {
        setShowHierarchyExplainer(true);
      });
  }, [isEditMode]);

  const dismissHierarchyExplainer = useCallback(() => {
    setShowHierarchyExplainer(false);
    AsyncStorage.setItem(
      TRAINING_PLAN_HIERARCHY_EXPLAINER_DISMISS_KEY,
      "1",
    ).catch(() => null);
  }, []);

  const handleFormDataChange = (nextData: TrainingPlanFormData) => {
    form.setValue("planStartDate", nextData.planStartDate, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("goals", nextData.goals, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleConfigChange = (nextData: TrainingPlanConfigFormData) => {
    const suggestionRelevantChanged =
      configData.recentInfluenceScore !== nextData.recentInfluenceScore ||
      configData.recentInfluenceAction !== nextData.recentInfluenceAction ||
      !areJsonStructurallyEqual(
        configData.availabilityConfig,
        nextData.availabilityConfig,
      ) ||
      !areJsonStructurallyEqual(
        configData.behaviorControlsV1,
        nextData.behaviorControlsV1,
      ) ||
      !areJsonStructurallyEqual(configData.constraints, nextData.constraints) ||
      !areJsonStructurallyEqual(configData.locks, nextData.locks);

    if (suggestionRelevantChanged) {
      setRecomputeNonce((value) => value + 1);
    }

    setDirtyState((previous) => ({
      availability:
        previous.availability ||
        nextData.availabilityProvenance.source === "user",
      recent:
        previous.recent ||
        nextData.recentInfluenceAction !== "accepted" ||
        nextData.recentInfluenceProvenance.source === "user",
      constraints:
        previous.constraints || nextData.constraintsSource === "user",
      behaviorControls:
        previous.behaviorControls ||
        hasBehaviorControlsChanged(
          configData.behaviorControlsV1,
          nextData.behaviorControlsV1,
        ),
    }));

    setConfigData(nextData);
  };

  useEffect(() => {
    if (!hasSeededDefaults) {
      return;
    }

    if (initializedFormDefaultsRef.current === null) {
      initializedFormDefaultsRef.current = cloneJson(formData);
    }

    if (initializedConfigDefaultsRef.current === null) {
      initializedConfigDefaultsRef.current = cloneJson(configData);
    }
  }, [configData, formData, hasSeededDefaults]);

  const handleResetGoals = useCallback(() => {
    const baseline = initializedFormDefaultsRef.current;
    if (!baseline) {
      return;
    }

    form.setValue("goals", cloneJson(baseline.goals), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form]);

  const handleResetAvailability = useCallback(() => {
    const baselineForm = initializedFormDefaultsRef.current;
    const baselineConfig = initializedConfigDefaultsRef.current;
    if (!baselineForm || !baselineConfig) {
      return;
    }

    form.setValue("planStartDate", baselineForm.planStartDate, {
      shouldDirty: true,
      shouldValidate: true,
    });

    setConfigData((previous) => ({
      ...previous,
      availabilityConfig: cloneJson(baselineConfig.availabilityConfig),
      availabilityProvenance: cloneJson(baselineConfig.availabilityProvenance),
      locks: {
        ...previous.locks,
        availability_config: cloneJson(
          baselineConfig.locks.availability_config,
        ),
      },
    }));

    setDirtyState((previous) => ({ ...previous, availability: false }));
    setRecomputeNonce((value) => value + 1);
  }, [form]);

  const handleResetLimits = useCallback(() => {
    const baselineConfig = initializedConfigDefaultsRef.current;
    if (!baselineConfig) {
      return;
    }

    setConfigData((previous) => ({
      ...previous,
      postGoalRecoveryDays: baselineConfig.postGoalRecoveryDays,
      behaviorControlsV1: cloneJson(baselineConfig.behaviorControlsV1),
      startingCtlAssumption: baselineConfig.startingCtlAssumption,
      startingFatigueState: baselineConfig.startingFatigueState,
      locks: {
        ...previous.locks,
        post_goal_recovery_days: cloneJson(
          baselineConfig.locks.post_goal_recovery_days,
        ),
        behavior_controls_v1: cloneJson(
          baselineConfig.locks.behavior_controls_v1,
        ),
      },
    }));

    setDirtyState((previous) => ({ ...previous, behaviorControls: false }));
    setRecomputeNonce((value) => value + 1);
  }, []);

  const handleResetProjectionAll = useCallback(() => {
    const baselineConfig = initializedConfigDefaultsRef.current;
    if (!baselineConfig) {
      return;
    }

    setConfigData((previous) => ({
      ...previous,
      calibration: cloneJson(baselineConfig.calibration),
      calibrationCompositeLocks: cloneJson(
        baselineConfig.calibrationCompositeLocks,
      ),
    }));

    setRecomputeNonce((value) => value + 1);
  }, []);

  const handleSave = async () => {
    if (!canCreatePlan || isCreateBlockedByPolicy) {
      return;
    }

    setIsCreating(true);

    try {
      const planName = planMetadata.name.trim();
      if (!planName) {
        Alert.alert("Invalid Input", "Plan name cannot be empty", [
          { text: "OK" },
        ]);
        return;
      }

      const description = planMetadata.description.trim();

      if (!featureFlags.trainingPlanCreateConfigMvp) {
        if (isEditMode) {
          throw new Error(
            "Edit from composer requires training plan config mode to be enabled.",
          );
        }

        const createdPlan = await createPlanLegacyMutation.mutateAsync(
          buildMinimalPayload(),
        );
        await updatePlanMetadataMutation.mutateAsync({
          id: createdPlan.id,
          name: planName,
          description: description.length > 0 ? description : null,
          is_active: planMetadata.isActive,
        });
        router.replace({
          pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
          params: { id: createdPlan.id, nextStep: "refine" },
        });
        return;
      }

      const payload = {
        minimal_plan: buildMinimalPayload(),
        creation_input: buildCreationInput(configData),
        starting_ctl_override: configData.startingCtlAssumption,
        starting_atl_override: resolveStartingAtlOverride(configData),
        post_create_behavior: {
          autonomous_mutation_enabled: false,
        },
        override_policy: {
          allow_blocking_conflicts: allowBlockingIssueOverride,
        },
        is_active: planMetadata.isActive,
      };

      if (isEditMode) {
        const updatedPlan = await updatePlanMutation.mutateAsync({
          ...payload,
          plan_id: contract.planId,
        });

        await updatePlanMetadataMutation.mutateAsync({
          id: updatedPlan.id,
          name: planName,
          description: description.length > 0 ? description : null,
          is_active: planMetadata.isActive,
        });

        router.replace({
          pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
          params: { id: updatedPlan.id, nextStep: "refine" },
        });
        return;
      }

      const createdPlan = await createPlanMutation.mutateAsync({
        ...payload,
      });

      await updatePlanMetadataMutation.mutateAsync({
        id: createdPlan.id,
        name: planName,
        description: description.length > 0 ? description : null,
        is_active: planMetadata.isActive,
      });

      router.replace({
        pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
        params: { id: createdPlan.id, nextStep: "refine" },
      });
    } catch (error) {
      console.error(
        "Failed to save training plan from creation config:",
        error,
      );
      const mapped = mapTrainingPlanSaveError(error);
      if (mapped.action === "refresh_preview") {
        Alert.alert("Error", mapped.message, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Refresh preview",
            onPress: () => {
              void refreshPreview();
            },
          },
        ]);
      } else {
        Alert.alert("Error", mapped.message, [{ text: "OK" }]);
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (isEditMode && editPlanQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-sm text-muted-foreground">
          Loading plan...
        </Text>
      </View>
    );
  }

  if (isEditMode && !editPlanQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold">Plan not found</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          This plan could not be loaded for editing.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: isEditMode ? "Edit Training Plan" : "Create Training Plan",
          headerShown: true,
          headerRight: () => (
            <Pressable
              onPress={() => {
                void form.handleSubmit(handleSave)();
              }}
              disabled={!canCreatePlan}
              hitSlop={8}
              className={canCreatePlan ? "opacity-100" : "opacity-50"}
              accessibilityRole="button"
              accessibilityLabel={
                isCreating
                  ? "Saving training plan"
                  : isEditMode
                    ? "Save training plan changes"
                    : "Create training plan"
              }
              accessibilityHint={
                isCreateBlockedByPolicy
                  ? "Resolve blocking issues or acknowledge override in Review before creating"
                  : "Saves your plan and opens it"
              }
              accessibilityState={{
                disabled: !canCreatePlan,
                busy: isCreating,
              }}
            >
              <Text className="font-semibold text-primary">
                {isCreating
                  ? "Saving..."
                  : isEditMode
                    ? "Save changes"
                    : "Create"}
              </Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {showHierarchyExplainer ? (
          <View className="px-4 pt-3">
            <View className="rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-foreground">
                    Plan Hierarchy
                  </Text>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    Activity plans are single workouts. Training plans arrange
                    workouts on a timeline. Templates are reusable versions of
                    either one.
                  </Text>
                </View>
                <Pressable
                  onPress={dismissHierarchyExplainer}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss hierarchy explainer"
                >
                  <Icon as={X} size={16} className="text-muted-foreground" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {previewState.previewError ? (
          <View className="px-4 pt-3">
            <Text className="text-xs text-destructive">
              {previewState.previewError}
            </Text>
            <Pressable
              onPress={() => {
                void refreshPreview();
              }}
              disabled={isPreviewPending}
              className="mt-2 self-start rounded-md border border-destructive/30 px-3 py-1"
              accessibilityRole="button"
              accessibilityLabel="Retry projection preview"
              accessibilityState={{ disabled: isPreviewPending }}
            >
              <Text className="text-xs font-medium text-destructive">
                Retry preview
              </Text>
            </Pressable>
          </View>
        ) : null}
        {isEditMode ? (
          <View className="px-4 pt-2">
            <Text className="text-xs text-muted-foreground">
              Saving updates future plan structure only. Completed activity
              history is unchanged.
            </Text>
          </View>
        ) : null}
        <SinglePageForm
          planMetadata={planMetadata}
          onPlanMetadataChange={setPlanMetadata}
          initialTab={contract.initialTab}
          formData={formData}
          onFormDataChange={handleFormDataChange}
          onResetGoals={handleResetGoals}
          showCreationConfig={featureFlags.trainingPlanCreateConfigMvp}
          configData={configData}
          projectionChart={previewState.projectionChart}
          readinessDeltaDiagnostics={readinessDeltaDiagnostics}
          onConfigChange={handleConfigChange}
          onResetAvailability={handleResetAvailability}
          onResetLimits={handleResetLimits}
          onResetProjectionAll={handleResetProjectionAll}
          contextSummary={contextSummary}
          feasibilitySafetySummary={feasibilitySummary}
          informationalConflicts={informationalConflicts}
          blockingIssues={blockingIssues}
          allowBlockingIssueOverride={allowBlockingIssueOverride}
          onAllowBlockingIssueOverrideChange={setAllowBlockingIssueOverride}
          isPreviewPending={
            isPreviewPending ||
            suggestionsQuery.isLoading ||
            suggestionsQuery.isFetching
          }
          errors={errors}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
