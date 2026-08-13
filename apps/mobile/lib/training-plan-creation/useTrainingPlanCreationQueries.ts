import { keepPreviousData, skipToken } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { getTrainingPlanStructureActivityPlanIds } from "./canonical-draft";
import type { UseTrainingPlanCreationServiceOptions } from "./service-types";

const ACTIVITY_PLAN_PICKER_PAGE_SIZE = 25;

export function useTrainingPlanCreationQueries({
  activityPlanPicker,
  mode = "create",
  onCreateError,
  onUpdateError,
  planId,
}: UseTrainingPlanCreationServiceOptions) {
  const utils = api.useUtils();
  const isEditMode = mode === "edit" && !!planId;
  const shouldLoadCreateContext = mode === "create";

  const profileQuery = api.profiles.get.useQuery();
  const profileGoalsQuery = useProfileGoals({
    enabled: shouldLoadCreateContext,
    loadAllPages: true,
    sortBy: "target_date",
    sortOrder: "asc",
  });
  const activityPlansQuery = api.activityPlans.list.useInfiniteQuery(
    {
      ownerScope: "discoverable",
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
  const projectionProfileId = profileQuery.data?.id;
  const publishedStateQuery = api.athleteIntelligence.getReadModel.useQuery(
    projectionProfileId
      ? {
          profileId: projectionProfileId,
          sections: {
            publishedState: true,
            status: true,
            currentBaseline: { includePlanningContext: true },
          },
        }
      : skipToken,
    { enabled: Boolean(projectionProfileId), refetchOnWindowFocus: false },
  );
  const creationContextQuery = publishedStateQuery;
  const editPlanActivityPlanIds = getTrainingPlanStructureActivityPlanIds(
    editPlanQuery.data?.structure,
  );
  const linkedActivityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    isEditMode && editPlanActivityPlanIds.length > 0 ? { ids: editPlanActivityPlanIds } : skipToken,
    {
      enabled: isEditMode && editPlanActivityPlanIds.length > 0,
    },
  );

  const commitPlanMutation = useReliableMutation(api.trainingPlans.commit, {
    invalidate: [utils.trainingPlans],
    silent: true,
    onError: (error) => {
      if (isEditMode) onUpdateError?.(error);
      else onCreateError?.(error);
    },
  });
  return {
    profileQuery,
    creationContextQuery,
    profileGoalsQuery,
    activityPlansQuery,
    editPlanQuery,
    linkedActivityPlansQuery,
    publishedStateQuery,
    commitPlanMutation,
  };
}
