import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { trpc } from "@/lib/trpc";
import { getErrorMessage, showErrorAlert } from "@/lib/utils/formErrors";
import {
  activityPlanCreateFormSchema,
  type ActivityPlanCreateFormData,
} from "@repo/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";

export type ActivityPlanFormData = ActivityPlanCreateFormData;

interface UseActivityPlanFormOptions {
  planId?: string;
  onSuccess?: (planId: string) => void;
  onError?: (error: any) => void;
}

/**
 * Hook for managing activity plan creation and editing forms
 * Integrates with Zustand store and tRPC mutations
 */
export function useActivityPlanForm(options: UseActivityPlanFormOptions = {}) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get form state from Zustand store
  const {
    name,
    description,
    activityLocation,
    activityCategory,
    structure,
    routeId,
    notes,
    setName,
    setDescription,
    setActivityLocation,
    setActivityCategory,
    setRouteId,
    setNotes,
    reset,
  } = useActivityPlanCreationStore();

  const isEditMode = !!options.planId;

  // Load existing plan for editing
  const { data: existingPlan, isLoading: isLoadingPlan } =
    trpc.activityPlans.getById.useQuery(
      { id: options.planId! },
      { enabled: isEditMode },
    );

  // Create mutation
  const createMutation = trpc.activityPlans.create.useMutation({
    onSuccess: async (data) => {
      // Invalidate queries to refresh lists
      await utils.activityPlans.list.invalidate();
      await utils.activityPlans.getUserPlansCount.invalidate();

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
  const updateMutation = trpc.activityPlans.update.useMutation({
    onSuccess: async (data) => {
      // Invalidate queries
      await utils.activityPlans.list.invalidate();
      await utils.activityPlans.getById.invalidate({ id: options.planId! });

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

  // Load existing plan data into form
  useEffect(() => {
    if (existingPlan && isEditMode) {
      setName(existingPlan.name);
      setDescription(existingPlan.description || "");
      setActivityLocation(existingPlan.activity_location);
      setActivityCategory(existingPlan.activity_category);
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
    setActivityLocation,
    setActivityCategory,
  ]);

  // Calculate metrics from V2 structure
  const metrics = useMemo(() => {
    const steps = structure.steps || [];

    const durationMs = steps.reduce((sum: number, step) => {
      const duration = step.duration;
      if (duration.type === "time") {
        return sum + duration.seconds * 1000;
      } else if (duration.type === "distance") {
        // Estimate 5 min/km
        return sum + (duration.meters / 1000) * 5 * 60 * 1000;
      } else if (duration.type === "repetitions") {
        // Estimate 30s per rep
        return sum + duration.count * 30 * 1000;
      }
      return sum;
    }, 0);

    return {
      stepCount: steps.length,
      durationMs,
      durationMinutes: Math.round(durationMs / 60000),
    };
  }, [structure]);

  // Validation
  const validate = useCallback(() => {
    try {
      activityPlanCreateFormSchema.parse({
        name,
        description: description || null,
        activity_location: activityLocation,
        activity_category: activityCategory,
        route_id: routeId || null,
        notes: notes || null,
        structure,
      });
      return { isValid: true, errors: {} };
    } catch (error: any) {
      if (error?.issues) {
        const errors: Record<string, string> = {};
        error.issues.forEach((err: any) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        return { isValid: false, errors };
      }
      return { isValid: false, errors: { general: getErrorMessage(error) } };
    }
  }, [
    name,
    description,
    activityLocation,
    activityCategory,
    structure,
    routeId,
    notes,
  ]);

  // Submit handler
  const submit = useCallback(async () => {
    // Check for empty structure first
    if (!structure.steps || structure.steps.length === 0) {
      Alert.alert(
        "Activity Structure Required",
        "Please add at least one step to your activity plan before saving.",
      );
      return null;
    }

    const validation = validate();
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      Alert.alert("Please Check Your Input", firstError);
      return null;
    }

    try {
      const payload = {
        name,
        description: description || "", // Empty string instead of null
        activity_location: activityLocation as any,
        activity_category: activityCategory as any,
        structure,
        route_id: routeId || null,
        notes: notes || null,
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
    activityLocation,
    activityCategory,
    structure,
    metrics,
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
      name !== "" || description !== "" || structure.steps.length > 0;

    if (hasChanges) {
      Alert.alert(
        "Discard Changes",
        "Are you sure you want to discard your changes?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              reset();
              router.back();
            },
          },
        ],
      );
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
      activityLocation,
      activityCategory,
      structure,
      routeId,
      notes,
    },

    // Form setters
    setName,
    setDescription,
    setActivityLocation,
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
    reset,

    // State
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isLoading: isLoadingPlan,
    isEditMode,
    error: createMutation.error || updateMutation.error,
  };
}
