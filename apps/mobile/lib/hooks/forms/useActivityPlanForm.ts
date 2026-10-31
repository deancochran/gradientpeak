import { invalidateActivityPlanQueries } from "@repo/api/react";
import {
  type ActivityPlanMetric,
  type ActivityPlanStructure,
  activityPlanAuthoringContentSchema,
  activityPlanStructureSchema,
  calculateActivityPlanStats,
  compileActivityPlan,
  consolidateActivityPlanText,
  normalizeActivityPlanAuthoringStructure,
  resolveActivityPlanDraft,
} from "@repo/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import type { ZodIssue } from "zod";
import { api } from "@/lib/api";
import { omitUndefined } from "@/lib/omitUndefined";
import {
  type ActivityPlanDraftStructure,
  useActivityPlanCreationStore,
} from "@/lib/stores/activityPlanCreation";
import { showErrorAlert } from "@/lib/utils/formErrors";

export type ActivityPlanValidationErrors = Record<string, string>;
export type ActivityPlanValidationIssue = {
  key: string;
  message: string;
  label?: string;
  intervalId?: string;
  stepId?: string;
  targetIndex?: number;
  targetId?: string;
  field?: "repetitions" | "duration" | "target";
};

export function mapActivityPlanIssueToUiKey(
  issue: ZodIssue,
  structure: ActivityPlanDraftStructure,
): string {
  const [root, itemIndex, itemField, stepIndex, stepField] = issue.path;
  if (root === "activity_category") return "activity_category";
  if (root !== "items" || typeof itemIndex !== "number") return "items";
  const item = structure.items[itemIndex];
  if (!item) return "items";
  if (itemField === "count") return `repeat:${item.id}:count`;
  const step =
    item.type === "step"
      ? item
      : itemField === "steps" && typeof stepIndex === "number"
        ? item.steps[stepIndex]
        : undefined;
  if (!step) return `item:${item.id}`;
  if (item.type === "step") {
    if (itemField === "duration") return `step:${step.id}:duration`;
    if (itemField === "targets") return `step:${step.id}:target`;
  }
  if (stepField === "duration") return `step:${step.id}:duration`;
  if (stepField === "targets") return `step:${step.id}:target`;
  return `step:${step.id}`;
}

interface UseActivityPlanFormOptions {
  planId?: string;
  onSuccess?: (planId: string) => void;
  onError?: (error: unknown) => void;
  onConflict?: () => void;
  isCurrent?: () => boolean;
}

export function useActivityPlanForm(options: UseActivityPlanFormOptions = {}) {
  const router = useRouter();
  const utils = api.useUtils();
  const store = useActivityPlanCreationStore();
  const isEditMode = Boolean(options.planId);
  const didInitialHydrateRef = useRef(false);
  const savedMetricsRef = useRef<readonly ActivityPlanMetric[]>([]);
  const active = useRef(true);
  const isCurrent = useRef(options.isCurrent);
  isCurrent.current = options.isCurrent;
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
      if (!active.current || isCurrent.current?.() === false) return;
      options.onSuccess?.(data.id);
      if (!active.current || isCurrent.current?.() === false) return;
      store.reset();
      setHydrationVersion((version) => version + 1);
    },
    onError: (error) => {
      if (!active.current || isCurrent.current?.() === false) return;
      if (options.onError) options.onError(error);
      else showErrorAlert(error, "Failed to Create Plan");
    },
  });
  const updateMutation = api.activityPlans.update.useMutation({
    retry: false,
    onSuccess: async (data) => {
      await Promise.allSettled([
        Promise.resolve().then(() =>
          invalidateActivityPlanQueries(
            utils,
            omitUndefined({
              planId: options.planId,
              includeDetail: true,
            }),
          ),
        ),
      ]);
      if (!active.current || isCurrent.current?.() === false) return;
      options.onSuccess?.(data.id);
    },
    onError: (error) => {
      if (!active.current || isCurrent.current?.() === false) return;
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
    (
      plan: NonNullable<typeof editPlan>,
      structure: ActivityPlanStructure,
      savedMetrics: readonly ActivityPlanMetric[] = [],
    ) => {
      store.reset();
      store.setName(plan.name);
      store.setDescription(
        consolidateActivityPlanText(plan.description, plan.notes, "Notes") ?? "",
      );
      store.setActivityCategory(structure.activity_category);
      store.setStructure(structure);
      savedMetricsRef.current = savedMetrics;
      setHydrationVersion((version) => version + 1);
    },
    [store],
  );

  const reloadFromServer = useCallback(async () => {
    const result = await refetchExistingPlan();
    if (!active.current || isCurrent.current?.() === false) return false;
    const freshPlan = result.data?.edit;
    const freshStructure = freshPlan
      ? activityPlanStructureSchema.safeParse(freshPlan.structure)
      : null;
    if (result.isError || !freshPlan || !freshStructure?.success) return false;
    hydrate(freshPlan, freshStructure.data, result.data?.detail?.metrics ?? []);
    editSnapshotRef.current = freshPlan;
    return true;
  }, [hydrate, refetchExistingPlan]);

  useEffect(() => {
    if (didInitialHydrateRef.current || !editPlan || !editStructure?.success || !isEditMode) return;
    hydrate(editPlan, editStructure.data, existingPlan?.detail?.metrics ?? []);
    editSnapshotRef.current = editPlan;
    didInitialHydrateRef.current = true;
  }, [editPlan, editStructure, existingPlan?.detail?.metrics, hydrate, isEditMode]);

  const metrics = useMemo(() => {
    const resolution = resolveActivityPlanDraft(store.structure);
    if (resolution.status !== "valid") return { stepCount: 0, durationMs: 0, durationMinutes: 0 };
    const stats = calculateActivityPlanStats(compileActivityPlan(resolution.structure));
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
      const issues: ActivityPlanValidationIssue[] = [];
      if (!store.name.trim()) errors.name = "Plan name is required.";
      const result = activityPlanAuthoringContentSchema.safeParse({
        structure: structureOverride,
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
          const path = issue.path[0] === "structure" ? issue.path.slice(1) : issue.path;
          const item =
            path[0] === "items" && typeof path[1] === "number"
              ? structureOverride.items[path[1]]
              : undefined;
          const step =
            item?.type === "step"
              ? item
              : item?.type === "repeat" && path[2] === "steps" && typeof path[3] === "number"
                ? item.steps[path[3]]
                : undefined;
          issues.push({
            key,
            message: issue.message,
            label: [
              "Activity structure",
              step?.name ?? "Step",
              path[4] === "targets"
                ? `Target ${typeof path[5] === "number" ? path[5] + 1 : "settings"}`
                : path[4] === "duration"
                  ? "Duration"
                  : path[2] === "repetitions"
                    ? "Repeats"
                    : "Details",
            ]
              .filter(Boolean)
              .join(" → "),
            ...(item?.type === "repeat" ? { intervalId: item.id } : {}),
            ...(step ? { stepId: step.id } : {}),
            ...(step && path[4] === "targets" && typeof path[5] === "number"
              ? { targetIndex: path[5], field: "target" as const }
              : path[4] === "duration"
                ? { field: "duration" as const }
                : path[2] === "count"
                  ? { field: "repetitions" as const }
                  : {}),
          });
        }
      }
      return { isValid: Object.keys(errors).length === 0, errors, issues };
    },
    [store.name, store.structure, authoringSnapshot],
  );
  const validation = useMemo(() => validate(), [validate]);

  const submit = useCallback(async () => {
    if (submitGuard.current || !active.current || isCurrent.current?.() === false) return null;
    if (isEditMode && editStatus !== "editable") {
      Alert.alert("Plan unavailable", "Refresh this plan before editing.");
      return null;
    }
    const resolution = resolveActivityPlanDraft(store.structure);
    const currentValidation = validate(store.structure);
    if (resolution.status !== "valid" || !currentValidation.isValid) {
      Alert.alert(
        "Please Check Your Input",
        Object.values(currentValidation.errors)[0] ?? "Invalid plan",
      );
      return null;
    }
    const normalized = normalizeActivityPlanAuthoringStructure(resolution.structure);
    if (!normalized.success) {
      setSubmitError(normalized.message);
      return null;
    }
    const payload = {
      name: store.name,
      description: store.description.trim() || null,
      structure: normalized.structure,
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
    active.current = false;
    store.reset();
    router.back();
  }, [router, store]);

  return {
    form: {
      name: store.name,
      description: store.description,
      activityCategory: store.activityCategory,
      structure: store.structure,
    },
    setName: (name: string) => {
      if (active.current && isCurrent.current?.() !== false) store.setName(name);
    },
    setDescription: (description: string) => {
      if (active.current && isCurrent.current?.() !== false) store.setDescription(description);
    },
    setActivityCategory: (category: typeof store.activityCategory) => {
      if (active.current && isCurrent.current?.() !== false) store.setActivityCategory(category);
    },
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
    persistedMetrics: savedMetricsRef.current,
    hydratedEditPlanId: editSnapshotRef.current?.id ?? null,
    hydratedStructure: editSnapshotRef.current?.structure ?? null,
    canSubmit:
      editStatus === "editable" &&
      validation.isValid &&
      !saving &&
      !createMutation.isPending &&
      !updateMutation.isPending,
    error: createMutation.error || updateMutation.error,
  };
}
