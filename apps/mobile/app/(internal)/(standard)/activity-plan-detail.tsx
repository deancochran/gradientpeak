import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityPlanDetailScreen } from "@/components/activity-plan/ActivityPlanDetailScreen";

export default function ActivityPlanDetailPage() {
  const params = useLocalSearchParams();

  return (
    <ActivityPlanDetailScreen
      planId={typeof params.planId === "string" ? params.planId : undefined}
      fallbackId={typeof params.id === "string" ? params.id : undefined}
      eventId={typeof params.eventId === "string" ? params.eventId : undefined}
      action={typeof params.action === "string" ? params.action : undefined}
      template={typeof params.template === "string" ? params.template : undefined}
      activityPlan={typeof params.activityPlan === "string" ? params.activityPlan : undefined}
    />
  );
}
