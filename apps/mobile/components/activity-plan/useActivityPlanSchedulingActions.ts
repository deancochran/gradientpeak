import { invalidateActivityPlanQueries } from "@repo/api/react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";

type RouterLike = {
  back: () => void;
  navigate: (value: unknown) => void;
  replace: (value: unknown) => void;
};

interface UseActivityPlanSchedulingActionsParams {
  action?: string;
  activityPlan: any;
  beginRedirect: () => void;
  eventId?: string;
  plannedActivity: any;
  planId?: string;
  profileId?: string;
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  router: RouterLike;
  utils: ReturnType<typeof api.useUtils>;
}

export function useActivityPlanSchedulingActions({
  action,
  activityPlan,
  beginRedirect,
  eventId,
  plannedActivity,
  planId,
  profileId,
  queryClient,
  router,
  utils,
}: UseActivityPlanSchedulingActionsParams) {
  const React = require("react") as typeof import("react");
  const duplicateActionRef = React.useRef<"copy" | null>(null);
  const scheduleActionHandledRef = React.useRef<string | null>(null);

  const scheduledDate = plannedActivity?.scheduled_date || null;
  const isScheduled = !!scheduledDate;

  const duplicatePlanMutation = api.activityPlans.duplicate.useMutation({
    onSuccess: (duplicatedPlan) => {
      duplicateActionRef.current = null;
      void invalidateActivityPlanQueries(utils);
      Alert.alert("Duplicated", "Activity plan added to your plans.", [
        {
          text: "Open",
          onPress: () =>
            router.replace({
              pathname: "/activity-plan-detail" as any,
              params: { planId: duplicatedPlan.id },
            }),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Duplicate failed", error.message || "Could not duplicate this activity plan");
    },
  });

  const removeScheduleMutation = api.events.delete.useMutation({
    onSuccess: () => {
      beginRedirect();
      void refreshScheduleViews(queryClient, "eventDeletionMutation");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to remove scheduled activity");
    },
  });

  const handleSchedule = () => {
    if (!activityPlan) return;
    if (!activityPlan.id) {
      Alert.alert(
        "Scheduling unavailable",
        "Create this activity plan first, then schedule it from its detail screen.",
      );
      return;
    }
    router.navigate({
      pathname: "/event-detail",
      params: {
        activityPlanId: activityPlan.id,
        mode: "create",
      },
    });
  };

  const handleReschedule = () => {
    if (!plannedActivity) return;
    router.navigate(ROUTES.PLAN.EVENT_UPDATE(plannedActivity.id));
  };

  const handleRemoveSchedule = () => {
    if (!plannedActivity) return;
    Alert.alert(
      "Remove Scheduled Activity",
      "This will remove the scheduled session from your calendar.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeScheduleMutation.mutate({ id: plannedActivity.id }),
        },
      ],
    );
  };

  const handleDuplicate = () => {
    const actualPlanId = planId || activityPlan?.id;
    if (!actualPlanId) {
      Alert.alert("Duplicate failed", "No activity plan ID was found.");
      return;
    }
    duplicateActionRef.current = "copy";
    duplicatePlanMutation.mutate({ id: actualPlanId, newName: `${activityPlan.name} (Copy)` });
  };

  React.useEffect(() => {
    if (action !== "schedule" || !activityPlan?.id) return;
    if (eventId && !plannedActivity?.id) return;
    const scheduleKey = `${activityPlan.id}:${eventId ?? "none"}:${action}`;
    if (scheduleActionHandledRef.current === scheduleKey) return;
    scheduleActionHandledRef.current = scheduleKey;
    if (eventId && plannedActivity?.id) {
      router.navigate(ROUTES.PLAN.EVENT_UPDATE(plannedActivity.id));
      return;
    }
    router.navigate({
      pathname: "/event-detail",
      params: {
        activityPlanId: activityPlan.id,
        mode: "create",
      },
    });
  }, [
    action,
    activityPlan?.id,
    activityPlan?.profile_id,
    eventId,
    plannedActivity?.id,
    profileId,
    router,
  ]);

  return {
    duplicatePending: duplicatePlanMutation.isPending,
    handleDuplicate,
    handleRemoveSchedule,
    handleReschedule,
    handleSchedule,
    isScheduled,
    primaryScheduleLabel: isScheduled ? "Reschedule" : "Schedule",
    removeSchedulePending: removeScheduleMutation.isPending,
    scheduledDate,
  };
}
