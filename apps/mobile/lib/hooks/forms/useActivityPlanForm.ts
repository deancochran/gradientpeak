import { type ActivityPlanCreateFormData, activityPlanCreateFormSchema } from "@repo/core";
import { invalidateActivityPlanQueries } from "@repo/api/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { api } from "@/lib/api";
import { getErrorMessage, showErrorAlert } from "@/lib/utils/formErrors";

export type ActivityPlanFormData = ActivityPlanCreateFormData;

export type ActivityPlanValidationErrors = Record<string, string>;

interface UseActivityPlanFormOptions {
  planId?: string;
  onSuccess?: (planId: string) => void;
  onError?: (error: any) => void;
}

/**
 * Hook for managing activity plan creation and editing forms
 * Integrates with Zustand store and API mutations
 */
export function useActivityPlanForm(options: UseActivityPlanFormOptions = {}) {
  const router = useRouter();
  const utils = api.useUtils();

  // Get form state from Zustand store
  const {
    name,
    description,
    activityCategory,
    structure,
    routeId,
    notes,
    setName,
    setDescription,
    setActivityCategory,
    setRouteId,
    setNotes,
    reset,
  } = useActivityPlanCreationStore();

  const isEditMode = !!options.planId;

  // Load existing plan for editing
  const { data: existingPlan, isLoading: isLoadingPlan } = api.activityPlans.getById.useQuery(
    { id: options.planId! },
    { enabled: isEditMode },
  );

  // Create mutation
  const createMutation = api.activityPlans.create.useMutation({
    onSuccess: async (data) => {
      await invalidateActivityPlanQueries(utils);

      // Call success callback if provided
      options.onSuccess?.(data.id);

      // Reset form
      reset();
    },
    onError: (error) => {
      console.error("Failed to create activity plan:", error);

      // Call custom error handler or show user-friendly alert
      if (options.onError) {
        options.onError(error);
      } else {
        showErrorAlert(error, "Failed to Create Plan");
      }
    },
  });

  // Update mutation
  const updateMutation = api.activityPlans.update.useMutation({
    onSuccess: async (data) => {
      await invalidateActivityPlanQueries(utils, {
        planId: options.planId,
        includeCount: false,
        includeDetail: true,
      });

      // Call success callback if provided
      options.onSuccess?.(data.id);
    },
    onError: (error) => {
      console.error("Failed to update activity plan:", error);

      // Call custom error handler or show user-friendly alert
      if (options.onError) {
        options.onError(error);
      } else {
        showErrorAlert(error, "Failed to Update Plan");
      }
    },
  });

  // Load existing plan data into form when in edit mode
  useEffect(() => {
    if (existingPlan && isEditMode) {
      // First reset the store to clear any previous data
      reset();

      // Then load the existing plan data
      setName(existingPlan.name);
      setDescription(existingPlan.description || "");
      setActivityCategory(existingPlan.activity_category);
      setRouteId(existingPlan.route_id || null);
      setNotes(existingPlan.notes || "");

      if (existingPlan.structure) {
        // Structure should already be in the correct format
        useActivityPlanCreationStore.setState({
          structure: existingPlan.structure as any,
        });
      }
    }
  }, [
    existingPlan,
    isEditMode,
    setName,
    setDescription,
    setActivityCategory,
    setRouteId,
    setNotes,
    reset,
  ]);

  // Calculate metrics from V2 structure
  const metrics = useMemo(() => {
    const intervals = structure.intervals || [];

    let totalSteps = 0;
    let durationMs = 0;

    for (const interval of intervals) {
      totalSteps += interval.steps.length * interval.repetitions;

      for (const step of interval.steps) {
        const duration = step.duration;
        let stepDurationMs = 0;

        if (duration.type === "time") {
          stepDurationMs = duration.seconds * 1000;
        } else if (duration.type === "distance") {
          // Estimate 5 min/km
          stepDurationMs = (duration.meters / 1000) * 5 * 60 * 1000;
        } else if (duration.type === "repetitions") {
          // Estimate 30s per rep
          stepDurationMs = duration.count * 30 * 1000;
        }

        durationMs += stepDurationMs * interval.repetitions;
      }
    }

    return {
      stepCount: totalSteps,
      durationMs,
      durationMinutes: Math.round(durationMs / 60000),
    };
  }, [structure]);

  const validateStrictStructure = useCallback(
    (structureToValidate = structure) => {
      const errors: ActivityPlanValidationErrors = {};

      if (!name?.trim()) {
        errors.name = "Plan name is required.";
      }

      if (!activityCategory) {
        errors.activity_category = "Activity type is required.";
      }

      const intervals = structureToValidate.intervals || [];
      if (intervals.length < 1) {
        errors.intervals = "Add at least one interval.";
      }

      intervals.forEach((interval, intervalIndex) => {
        if (!Number.isFinite(interval.repetitions) || interval.repetitions < 1) {
          errors[`interval:${interval.id}:repetitions`] = "Repeat count must be at least 1.";
        }

        if (!interval.steps || interval.steps.length < 1) {
          errors[`interval:${interval.id}:steps`] = "Each interval must include at least one step.";
        }

        interval.steps.forEach((step, stepIndex) => {
          const durationErrorKey = `step:${interval.id}:${step.id}:duration`;
          const targetErrorKey = `step:${interval.id}:${step.id}:target`;

          const hasPositiveDuration =
            (step.duration.type === "time" && step.duration.seconds > 0) ||
            (step.duration.type === "distance" && step.duration.meters > 0) ||
            (step.duration.type === "repetitions" && step.duration.count > 0);

          if (!hasPositiveDuration) {
            errors[durationErrorKey] =
              "Step duration must be greater than zero (time, distance, or reps).";
          }

          const primaryTarget = step.targets?.[0];
          const hasValidTarget =
            !!primaryTarget &&
            typeof primaryTarget.type === "string" &&
            primaryTarget.type.length > 0 &&
            Number.isFinite(primaryTarget.intensity) &&
            primaryTarget.intensity > 0;

          if (!hasValidTarget) {
            errors[targetErrorKey] = "Set an intensity zone/type target for this step.";
          }

          if (!step.name?.trim()) {
            errors[`step:${interval.id}:${step.id}:name`] = `Step ${stepIndex + 1} needs a name.`;
          }
        });

        if (!interval.name?.trim()) {
          errors[`interval:${interval.id}:name`] = `Interval ${intervalIndex + 1} needs a name.`;
        }
      });

      return errors;
    },
    [name, activityCategory, structure],
  );

  // Validation
  const validate = useCallback(
    (structureOverride = structure) => {
      const strictErrors = validateStrictStructure(structureOverride);

      try {
        activityPlanCreateFormSchema.parse({
          name,
          description: description || null,
          activity_category: activityCategory,
          route_id: routeId || null,
          notes: notes || null,
          structure: structureOverride,
        });

        return {
          isValid: Object.keys(strictErrors).length === 0,
          errors: strictErrors,
        };
      } catch (error: any) {
        const schemaErrors: ActivityPlanValidationErrors = { ...strictErrors };
        if (error?.issues) {
          error.issues.forEach((err: any) => {
            if (err.path[0]) {
              schemaErrors[err.path[0] as string] = err.message;
            }
          });
          return { isValid: false, errors: schemaErrors };
        }

        return {
          isValid: false,
          errors: {
            ...schemaErrors,
            general: getErrorMessage(error),
          },
        };
      }
    },
    [validateStrictStructure, name, description, activityCategory, structure, routeId, notes],
  );

  const validation = useMemo(() => validate(), [validate]);

  // Submit handler
  const submit = useCallback(async () => {
    const structureToSubmit = structure;

    const validation = validate(structureToSubmit);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      Alert.alert("Please Check Your Input", firstError);
      return null;
    }

    try {
      const payload = {
        name,
        description: description && description.trim() !== "" ? description : null,
        activity_category: activityCategory as any,
        structure: structureToSubmit,
        route_id: routeId || null,
        notes: notes && notes.trim() !== "" ? notes : null,
        // estimated_duration and estimated_tss are now calculated server-side
      };

      if (isEditMode) {
        const result = await updateMutation.mutateAsync({
          id: options.planId!,
          ...payload,
        });
        return result;
      } else {
        const result = await createMutation.mutateAsync(payload);
        return result;
      }
    } catch (error) {
      console.error("Submit error:", error);
      // Error is already handled by mutation onError callbacks
      // Just log and return null to indicate failure
      return null;
    }
  }, [
    validate,
    name,
    description,
    activityCategory,
    structure,
    routeId,
    notes,
    isEditMode,
    options.planId,
    createMutation,
    updateMutation,
  ]);

  // Cancel handler
  const cancel = useCallback(() => {
    const hasChanges =
      name !== "" || description !== "" || (structure.intervals && structure.intervals.length > 0);

    if (hasChanges) {
      Alert.alert("Discard Changes", "Are you sure you want to discard your changes?", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            reset();
            router.back();
          },
        },
      ]);
    } else {
      reset();
      router.back();
    }
  }, [name, description, structure, reset, router]);

  return {
    // Form values
    form: {
      name,
      description,
      activityCategory,
      structure,
      routeId,
      notes,
    },

    // Form setters
    setName,
    setDescription,
    setActivityCategory,
    setRouteId,
    setNotes,

    // Metrics
    metrics: {
      stepCount: metrics.stepCount,
      duration: metrics.durationMinutes,
      durationMs: metrics.durationMs,
    },

    // Actions
    submit,
    cancel,
    validate,
    validation,
    reset,

    // State
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isLoading: isLoadingPlan,
    isEditMode,
    canSubmit: validation.isValid && !createMutation.isPending && !updateMutation.isPending,
    error: createMutation.error || updateMutation.error,
  };
}
