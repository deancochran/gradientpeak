import { invalidateActivityPlanQueries } from "@repo/api/react";
import {
  activityPlanStructureSchema,
  calculateActivityPlanStats,
  compileActivityPlan,
} from "@repo/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import type { ZodIssue } from "zod";
import { api } from "@/lib/api";
import {
  type EditableActivityPlanStructure,
  useActivityPlanCreationStore,
} from "@/lib/stores/activityPlanCreation";
import { showErrorAlert } from "@/lib/utils/formErrors";

export type ActivityPlanValidationErrors = Record<string, string>;

export function mapActivityPlanIssueToUiKey(
  issue: ZodIssue,
  structure: EditableActivityPlanStructure,
): string {
  const [root, segmentIndex, segmentField, intervalIndex, intervalField, stepIndex, stepField] =
    issue.path;
  if (root !== "segments" || typeof segmentIndex !== "number") return "segments";
  const segment = structure.segments[segmentIndex];
  if (!segment || segment.role !== "activity") return "segments";
  if (segmentField !== "intervals") return "segments";
  if (typeof intervalIndex !== "number") return "intervals";
  const interval = segment.intervals[intervalIndex];
  if (!interval) return "intervals";
  if (intervalField === "repetitions") return `interval:${interval.id}:repetitions`;
  if (intervalField !== "steps") return `interval:${interval.id}:steps`;
  if (typeof stepIndex !== "number") return `interval:${interval.id}:steps`;
  const step = interval.steps[stepIndex];
  if (!step) return `interval:${interval.id}:steps`;
  if (stepField === "duration") return `step:${interval.id}:${step.id}:duration`;
  if (stepField === "targets") return `step:${interval.id}:${step.id}:target`;
  return `interval:${interval.id}:steps`;
}

interface UseActivityPlanFormOptions {
  planId?: string;
  onSuccess?: (planId: string) => void;
  onError?: (error: unknown) => void;
}

export function useActivityPlanForm(options: UseActivityPlanFormOptions = {}) {
  const router = useRouter();
  const utils = api.useUtils();
  const store = useActivityPlanCreationStore();
  const isEditMode = Boolean(options.planId);
  const {
    data: existingPlan,
    isLoading: isLoadingPlan,
    refetch: refetchExistingPlan,
  } = api.activityPlans.getById.useQuery({ id: options.planId ?? "" }, { enabled: isEditMode });
  const createMutation = api.activityPlans.create.useMutation({
    onSuccess: async (data) => {
      await invalidateActivityPlanQueries(utils);
      options.onSuccess?.(data.id);
      store.reset();
    },
    onError: (error) => options.onError?.(error) ?? showErrorAlert(error, "Failed to Create Plan"),
  });
  const updateMutation = api.activityPlans.update.useMutation({
    onSuccess: async (data) => {
      await invalidateActivityPlanQueries(utils, {
        planId: options.planId,
        includeDetail: true,
      });
      options.onSuccess?.(data.id);
    },
    onError: async (error) => {
      if (error.data?.code === "CONFLICT") await refetchExistingPlan();
      options.onError?.(error) ?? showErrorAlert(error, "Failed to Update Plan");
    },
  });
  const editStatus = !isEditMode ? "editable" : !existingPlan ? "loading" : "editable";

  useEffect(() => {
    if (!existingPlan || !isEditMode) return;
    const parsed = activityPlanStructureSchema.safeParse(existingPlan.structure);
    if (!parsed.success) {
      Alert.alert("Unsupported plan", "This plan is not a valid version 3 activity plan.");
      return;
    }
    store.reset();
    store.setName(existingPlan.name);
    store.setDescription(existingPlan.description || "");
    store.setNotes(existingPlan.notes || "");
    store.setActivityCategory(parsed.data.activity_category);
    store.setStructure(parsed.data);
  }, [
    existingPlan,
    isEditMode,
    store.reset,
    store.setName,
    store.setDescription,
    store.setNotes,
    store.setActivityCategory,
    store.setStructure,
  ]);

  const metrics = useMemo(() => {
    const parsed = activityPlanStructureSchema.safeParse(store.structure);
    if (!parsed.success) return { stepCount: 0, durationMs: 0, durationMinutes: 0 };
    const stats = calculateActivityPlanStats(compileActivityPlan(parsed.data));
    const exactSeconds = stats.duration.exactElapsedSeconds ?? 0;
    return {
      stepCount: stats.occurrenceCount,
      durationMs: exactSeconds * 1000,
      durationMinutes: Math.round(exactSeconds / 60),
    };
  }, [store.structure]);

  const validate = useCallback(
    (structureOverride = store.structure) => {
      const errors: ActivityPlanValidationErrors = {};
      if (!store.name.trim()) errors.name = "Plan name is required.";
      const result = activityPlanStructureSchema.safeParse(structureOverride);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = mapActivityPlanIssueToUiKey(issue, structureOverride);
          errors[key] ??= issue.message;
        }
      }
      return { isValid: Object.keys(errors).length === 0, errors };
    },
    [store.name, store.structure],
  );
  const validation = useMemo(() => validate(), [validate]);

  const submit = useCallback(async () => {
    if (isEditMode && editStatus !== "editable") {
      Alert.alert("Plan unavailable", "Refresh this plan before editing.");
      return null;
    }
    const parsed = activityPlanStructureSchema.safeParse(store.structure);
    const currentValidation = validate(store.structure);
    if (!parsed.success || !currentValidation.isValid) {
      Alert.alert(
        "Please Check Your Input",
        Object.values(currentValidation.errors)[0] ?? "Invalid plan",
      );
      return null;
    }
    const payload = {
      name: store.name,
      description: store.description.trim() || null,
      structure: parsed.data,
      notes: store.notes.trim() || null,
    };
    try {
      if (isEditMode) {
        if (!options.planId) throw new Error("Edit mode requires a plan id");
        if (!existingPlan?.structure_hash)
          throw new Error("Refresh this plan before saving changes.");
        return await updateMutation.mutateAsync({
          id: options.planId,
          expectedStructureHash: existingPlan.structure_hash,
          ...payload,
        });
      }
      return await createMutation.mutateAsync(payload);
    } catch (error) {
      console.error("Submit error:", error);
      return null;
    }
  }, [
    store,
    validate,
    isEditMode,
    editStatus,
    options.planId,
    existingPlan?.structure_hash,
    createMutation,
    updateMutation,
  ]);

  const cancel = useCallback(() => {
    const discard = () => {
      store.reset();
      router.back();
    };
    if (store.name || store.description || store.structure.segments.length > 0) {
      Alert.alert("Discard Changes", "Are you sure you want to discard your changes?", [
        { text: "Keep Editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: discard },
      ]);
    } else discard();
  }, [router, store]);

  return {
    form: {
      name: store.name,
      description: store.description,
      activityCategory: store.activityCategory,
      structure: store.structure,
      notes: store.notes,
    },
    setName: store.setName,
    setDescription: store.setDescription,
    setActivityCategory: store.setActivityCategory,
    setNotes: store.setNotes,
    metrics: {
      stepCount: metrics.stepCount,
      duration: metrics.durationMinutes,
      durationMs: metrics.durationMs,
    },
    submit,
    cancel,
    validate,
    validation,
    reset: store.reset,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isLoading: isLoadingPlan,
    isEditMode,
    editStatus,
    isEditBlocked: isEditMode && editStatus !== "editable",
    canSubmit:
      editStatus === "editable" &&
      validation.isValid &&
      !createMutation.isPending &&
      !updateMutation.isPending,
    error: createMutation.error || updateMutation.error,
  };
}
