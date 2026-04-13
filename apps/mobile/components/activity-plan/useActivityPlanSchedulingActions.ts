import { invalidateActivityPlanQueries, invalidateTrainingPlanQueries } from "@repo/api/react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { buildPlanRoute, ROUTES } from "@/lib/constants/routes";
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
  const [showScheduleModal, setShowScheduleModal] = React.useState(false);
  const duplicateActionRef = React.useRef<"copy" | "schedule" | null>(null);
  const scheduleActionHandledRef = React.useRef<string | null>(null);

  const scheduledDate = plannedActivity?.scheduled_date || null;
  const isScheduled = !!scheduledDate;

  const duplicatePlanMutation = api.activityPlans.duplicate.useMutation({
    onSuccess: async (duplicatedPlan) => {
      const duplicateAction = duplicateActionRef.current;
      duplicateActionRef.current = null;
      await invalidateActivityPlanQueries(utils);
      if (duplicateAction === "schedule") {
        router.replace(buildPlanRoute(duplicatedPlan.id, "schedule") as any);
        return;
      }
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
    onSuccess: async () => {
      beginRedirect();
      setShowScheduleModal(false);
      await refreshScheduleViews(queryClient, "eventDeletionMutation");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to remove scheduled activity");
    },
  });

  const handleSchedule = () => {
    if (!activityPlan) return;
    const isOwnedByUser = activityPlan.profile_id === profileId;
    if (!activityPlan.id) {
      Alert.alert(
        "Scheduling unavailable",
        "Create this activity plan first, then schedule it from its detail screen.",
      );
      return;
    }
    if (!isOwnedByUser) {
      duplicateActionRef.current = "schedule";
      duplicatePlanMutation.mutate({ id: activityPlan.id, newName: `${activityPlan.name} (Copy)` });
      return;
    }
    setShowScheduleModal(true);
  };

  const handleReschedule = () => {
    if (!plannedActivity) return;
    setShowScheduleModal(true);
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
    const scheduleKey = `${activityPlan.id}:${eventId ?? "none"}:${action}`;
    if (scheduleActionHandledRef.current === scheduleKey) return;
    if (activityPlan.profile_id !== profileId) return;
    scheduleActionHandledRef.current = scheduleKey;
    setShowScheduleModal(true);
  }, [action, activityPlan?.id, activityPlan?.profile_id, eventId, profileId]);

  return {
    duplicatePending: duplicatePlanMutation.isPending,
    handleDuplicate,
    handleRemoveSchedule,
    handleReschedule,
    handleSchedule,
    isScheduled,
    primaryScheduleLabel: isScheduled
      ? "Reschedule"
      : activityPlan?.profile_id === profileId
        ? "Schedule"
        : duplicatePlanMutation.isPending
          ? "Duplicating..."
          : "Duplicate and Schedule",
    removeSchedulePending: removeScheduleMutation.isPending,
    scheduleModalProps: {
      activityPlan:
        !planId && !eventId && activityPlan?.profile_id === profileId ? activityPlan : undefined,
      activityPlanId: eventId
        ? undefined
        : activityPlan?.profile_id === profileId
          ? activityPlan?.id
          : undefined,
      eventId,
      onClose: () => setShowScheduleModal(false),
      onSuccess: () => {
        setShowScheduleModal(false);
        utils.events.invalidate();
        void invalidateTrainingPlanQueries(utils);
        router.navigate(ROUTES.PLAN.CALENDAR);
      },
      visible: showScheduleModal,
    },
    scheduledDate,
  };
}
