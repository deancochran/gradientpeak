import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import { z } from "zod";

/**
 * Validation schema for activity plan form
 */
const activityPlanFormSchema = z.object({
  name: z.string().min(1, "Activity name is required").max(200),
  description: z.string().max(1000),
  activityType: z.enum([
    "outdoor_run",
    "outdoor_bike",
    "indoor_treadmill",
    "indoor_bike_trainer",
    "indoor_strength",
    "indoor_swim",
    "other",
  ]),
  structure: z.object({
    steps: z.array(z.any()), // Full validation handled by backend
  }),
});

export type ActivityPlanFormData = z.infer<typeof activityPlanFormSchema>;

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
    activityType,
    structure,
    routeId,
    notes,
    setName,
    setDescription,
    setActivityType,
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
      options.onError?.(error as Error);
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
      options.onError?.(error as Error);
    },
  });

  // Load existing plan data into form
  useEffect(() => {
    if (existingPlan && isEditMode) {
      setName(existingPlan.name);
      setDescription(existingPlan.description || "");
      setActivityType(existingPlan.activity_type);
      if (existingPlan.structure) {
        // Structure should already be in the correct format
        useActivityPlanCreationStore.setState({
          structure: existingPlan.structure as any,
        });
      }
    }
  }, [existingPlan, isEditMode, setName, setDescription, setActivityType]);

  // Calculate metrics from structure
  const metrics = useMemo(() => {
    const flatSteps = structure.steps.flatMap((step: any) => {
      if (step.type === "repetition") {
        return Array(step.repeat || 1)
          .fill(step.steps)
          .flat();
      }
      return [step];
    });

    const durationMs = flatSteps.reduce((sum: number, step: any) => {
      if (!step.duration || step.duration === "untilFinished") return sum;
      const value = step.duration.value || 0;
      const multiplier =
        step.duration.unit === "minutes"
          ? 60000
          : step.duration.unit === "seconds"
            ? 1000
            : step.duration.unit === "hours"
              ? 3600000
              : 0;
      return sum + value * multiplier;
    }, 0);

    return {
      stepCount: flatSteps.length,
      durationMs,
      durationMinutes: Math.round(durationMs / 60000),
    };
  }, [structure]);

  // Validation
  const validate = useCallback(() => {
    try {
      activityPlanFormSchema.parse({
        name,
        description,
        activityType,
        structure,
      });
      return { isValid: true, errors: {} };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        return { isValid: false, errors };
      }
      return { isValid: false, errors: { general: "Validation failed" } };
    }
  }, [name, description, activityType, structure]);

  // Submit handler
  const submit = useCallback(async () => {
    const validation = validate();
    if (!validation.isValid) {
      Alert.alert("Validation Error", Object.values(validation.errors)[0]);
      return null;
    }

    try {
      const payload = {
        name,
        description: description || "",
        activity_type: activityType as any,
        structure,
        route_id: routeId || undefined,
        notes: notes || undefined,
        estimated_duration: metrics.durationMinutes || 0,
        estimated_tss: 0, // TODO: Calculate based on structure and user settings
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
      return null;
    }
  }, [
    validate,
    name,
    description,
    activityType,
    structure,
    metrics,
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
      activityType,
      structure,
      routeId,
      notes,
    },

    // Form setters
    setName,
    setDescription,
    setActivityType,
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
