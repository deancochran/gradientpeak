import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityPlanComposerScreen } from "@/components/activity-plan/ActivityPlanComposerScreen";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

export default function CreateActivityPlanRoute() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const reset = useActivityPlanCreationStore((state) => state.reset);

  useEffect(() => {
    if (!planId) {
      reset();
    }
  }, [planId, reset]);

  if (planId) {
    return <ActivityPlanComposerScreen mode="edit" planId={planId} />;
  }

  return <ActivityPlanComposerScreen mode="create" />;
}
