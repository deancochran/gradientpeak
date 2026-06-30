import { keepPreviousData, skipToken } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { getTrainingPlanStructureActivityPlanIds } from "./mappers";
import type { UseTrainingPlanCreationServiceOptions } from "./service-types";

const ACTIVITY_PLAN_PICKER_PAGE_SIZE = 25;

export function useTrainingPlanCreationQueries({
  activityPlanPicker,
  mode = "create",
  onCreated,
  onCreateError,
  onUpdated,
  onUpdateError,
  planId,
}: UseTrainingPlanCreationServiceOptions) {
  const utils = api.useUtils();
  const isEditMode = mode === "edit" && !!planId;
  const shouldLoadCreateContext = mode === "create";

  const profileQuery = api.profiles.get.useQuery(undefined, {
    enabled: shouldLoadCreateContext,
  });
  const profileMetricsQuery = api.profileMetrics.list.useQuery(
    { limit: 50 },
    { enabled: shouldLoadCreateContext },
  );
  const activityEffortsQuery = api.activityEfforts.getForProfile.useQuery(undefined, {
    enabled: shouldLoadCreateContext,
  });
  const currentTrainingStatusQuery = api.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: shouldLoadCreateContext,
    refetchOnWindowFocus: false,
  });
  const profileGoalsQuery = useProfileGoals({
    enabled: shouldLoadCreateContext,
    loadAllPages: true,
    sortBy: "target_date",
    sortOrder: "asc",
  });
  const activityPlansQuery = api.activityPlans.list.useInfiniteQuery(
    {
      ownerScope: "discoverable",
      includeEstimation: true,
      search: activityPlanPicker?.searchQuery.trim() || undefined,
      activityCategories: activityPlanPicker?.activityCategoryFilter
        ? [activityPlanPicker.activityCategoryFilter]
        : undefined,
      limit: ACTIVITY_PLAN_PICKER_PAGE_SIZE,
    },
    {
      enabled: activityPlanPicker?.enabled ?? false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );
  const editPlanQuery = api.trainingPlans.get.useQuery(isEditMode ? { id: planId } : skipToken, {
    enabled: isEditMode,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const editPlanActivityPlanIds = getTrainingPlanStructureActivityPlanIds(
    editPlanQuery.data?.structure,
  );
  const linkedActivityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    isEditMode && editPlanActivityPlanIds.length > 0 ? { ids: editPlanActivityPlanIds } : skipToken,
    {
      enabled: isEditMode && editPlanActivityPlanIds.length > 0,
    },
  );

  const createPlanMutation = useReliableMutation(api.trainingPlans.create, {
    invalidate: [utils.trainingPlans],
    silent: true,
    onSuccess: (createdPlan) => {
      onCreated?.(createdPlan);
    },
    onError: (error) => {
      onCreateError?.(error);
    },
  });
  const updatePlanMutation = useReliableMutation(api.trainingPlans.update, {
    invalidate: [utils.trainingPlans],
    silent: true,
    onSuccess: (updatedPlan) => {
      onUpdated?.(updatedPlan);
    },
    onError: (error) => {
      onUpdateError?.(error);
    },
  });
  const createFromCreationConfigMutation = useReliableMutation(
    api.trainingPlans.createFromCreationConfig,
    {
      invalidate: [utils.trainingPlans],
      silent: true,
      onSuccess: (createdPlan) => {
        onCreated?.(createdPlan);
      },
      onError: (error) => {
        onCreateError?.(error);
      },
    },
  );
  const updateFromCreationConfigMutation = useReliableMutation(
    api.trainingPlans.updateFromCreationConfig,
    {
      invalidate: [utils.trainingPlans],
      silent: true,
      onSuccess: (updatedPlan) => {
        onUpdated?.(updatedPlan);
      },
      onError: (error) => {
        onUpdateError?.(error);
      },
    },
  );

  return {
    profileQuery,
    profileMetricsQuery,
    activityEffortsQuery,
    currentTrainingStatusQuery,
    profileGoalsQuery,
    activityPlansQuery,
    editPlanQuery,
    linkedActivityPlansQuery,
    createPlanMutation,
    updatePlanMutation,
    createFromCreationConfigMutation,
    updateFromCreationConfigMutation,
  };
}
