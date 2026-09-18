import { invalidateActivityPlanQueries } from "@repo/api/react";
import {
  type ActivityPlanStructure,
  activityPlanAuthoringContentSchema,
  activityPlanStructureSchema,
  calculateActivityPlanStats,
  compileActivityPlan,
  consolidateActivityPlanText,
} from "@repo/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  if (stepField === "purpose") return `step:${interval.id}:${step.id}:purpose`;
  return `interval:${interval.id}:steps`;
}

interface UseActivityPlanFormOptions {
  planId?: string;
  onSuccess?: (planId: string) => void;
  onError?: (error: unknown) => void;
  onConflict?: () => void;
}

export function useActivityPlanForm(options: UseActivityPlanFormOptions = {}) {
  const router = useRouter();
  const utils = api.useUtils();
  const store = useActivityPlanCreationStore();
  const isEditMode = Boolean(options.planId);
  const didInitialHydrateRef = useRef(false);
  const active = useRef(true);
  const submitGuard = useRef(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [hydrationVersion, setHydrationVersion] = useState(0);
  const {
    data: existingPlan,
    isError: isExistingPlanError,
    isLoading: isLoadingPlan,
    refetch: refetchExistingPlan,
  } = api.activityPlans.getById.useQuery({ id: options.planId ?? "" }, { enabled: isEditMode });
  const createMutation = api.activityPlans.create.useMutation({
    retry: false,
    onSuccess: async (data) => {
      await Promise.allSettled([
        Promise.resolve().then(() => invalidateActivityPlanQueries(utils)),
      ]);
      if (!active.current) return;
      options.onSuccess?.(data.id);
      if (!active.current) return;
      store.reset();
      setHydrationVersion((version) => version + 1);
    },
    onError: (error) => {
      if (!active.current) return;
      if (options.onError) options.onError(error);
      else showErrorAlert(error, "Failed to Create Plan");
    },
  });
  const updateMutation = api.activityPlans.update.useMutation({
    retry: false,
    onSuccess: async (data) => {
      await Promise.allSettled([
        Promise.resolve().then(() =>
          invalidateActivityPlanQueries(utils, {
            planId: options.planId,
            includeDetail: true,
          }),
        ),
      ]);
      if (!active.current) return;
      options.onSuccess?.(data.id);
    },
    onError: (error) => {
      if (!active.current) return;
      if (error.data?.code === "CONFLICT") {
        options.onConflict?.();
        return;
      }
      if (options.onError) options.onError(error);
      else showErrorAlert(error, "Failed to Update Plan");
    },
  });
  const editPlan = existingPlan?.edit;
  const editSnapshotRef = useRef<NonNullable<typeof editPlan> | null>(null);
  const editStructure = editPlan ? activityPlanStructureSchema.safeParse(editPlan.structure) : null;
  const editStatus = !isEditMode
    ? "editable"
    : isLoadingPlan
      ? "loading"
      : isExistingPlanError || !existingPlan || !editPlan
        ? "error"
        : !editStructure?.success
          ? "unavailable"
          : "editable";

  const hydrate = useCallback(
    (plan: NonNullable<typeof editPlan>, structure: ActivityPlanStructure) => {
      store.reset();
      store.setName(plan.name);
      store.setDescription(
        consolidateActivityPlanText(plan.description, plan.notes, "Notes") ?? "",
      );
      store.setNotes("");
      store.setActivityCategory(structure.activity_category);
      store.setStructure(structure);
      setHydrationVersion((version) => version + 1);
    },
    [store],
  );

  const reloadFromServer = useCallback(async () => {
    const result = await refetchExistingPlan();
    if (!active.current) return false;
    const freshPlan = result.data?.edit;
    const freshStructure = freshPlan
      ? activityPlanStructureSchema.safeParse(freshPlan.structure)
      : null;
    if (result.isError || !freshPlan || !freshStructure?.success) return false;
    hydrate(freshPlan, freshStructure.data);
    editSnapshotRef.current = freshPlan;
    return true;
  }, [hydrate, refetchExistingPlan]);

  useEffect(() => {
    if (didInitialHydrateRef.current || !editPlan || !editStructure?.success || !isEditMode) return;
    hydrate(editPlan, editStructure.data);
    editSnapshotRef.current = editPlan;
    didInitialHydrateRef.current = true;
  }, [editPlan, editStructure, hydrate, isEditMode]);

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

  const authoringSnapshot = editSnapshotRef.current;
  const validate = useCallback(
    (structureOverride = store.structure) => {
      const errors: ActivityPlanValidationErrors = {};
      if (!store.name.trim()) errors.name = "Plan name is required.";
      const result = activityPlanAuthoringContentSchema.safeParse({
        structure: structureOverride,
        adaptation: authoringSnapshot?.adaptation ?? null,
        intent: { training_intent: authoringSnapshot?.trainingIntent ?? "general_maintenance" },
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key =
            issue.path[0] === "structure"
              ? mapActivityPlanIssueToUiKey(
                  { ...issue, path: issue.path.slice(1) },
                  structureOverride,
                )
              : issue.path.join(".");
          errors[key] ??= issue.message;
        }
      }
      return { isValid: Object.keys(errors).length === 0, errors };
    },
    [store.name, store.structure, authoringSnapshot],
  );
  const validation = useMemo(() => validate(), [validate]);

  const submit = useCallback(async () => {
    if (submitGuard.current || !active.current) return null;
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
      notes: null,
    };
    submitGuard.current = true;
    setSaving(true);
    setSubmitError(null);
    try {
      if (isEditMode) {
        if (!options.planId) throw new Error("Edit mode requires a plan id");
        const editSnapshot = editSnapshotRef.current;
        if (!editSnapshot?.structureHash)
          throw new Error("Refresh this plan before saving changes.");
        return await updateMutation.mutateAsync({
          id: options.planId,
          expectedStructureHash: editSnapshot.structureHash,
          expectedRevision: editSnapshot.activityPlanRevision,
          adaptation: editSnapshot.adaptation,
          training_intent: editSnapshot.trainingIntent,
          ...payload,
        });
      }
      return await createMutation.mutateAsync(payload);
    } catch (error) {
      if (active.current)
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Activity plan could not be saved. Your changes are kept.",
        );
      console.error("Submit error:", error);
      return null;
    } finally {
      submitGuard.current = false;
      if (active.current) setSaving(false);
    }
  }, [store, validate, isEditMode, editStatus, options.planId, createMutation, updateMutation]);

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
    isSubmitting: saving || createMutation.isPending || updateMutation.isPending,
    isLoading: isLoadingPlan,
    isEditMode,
    editStatus,
    isEditBlocked: isEditMode && editStatus !== "editable",
    reloadFromServer,
    retryLoad: refetchExistingPlan,
    submitError,
    hydrationVersion,
    canSubmit:
      editStatus === "editable" &&
      validation.isValid &&
      !saving &&
      !createMutation.isPending &&
      !updateMutation.isPending,
    error: createMutation.error || updateMutation.error,
  };
}
