import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityPlanComposerScreen } from "@/components/activity-plan/ActivityPlanComposerScreen";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

export default function CreateActivityPlanRoute() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const reset = useActivityPlanCreationStore((state) => state.reset);
  const [createReady, setCreateReady] = useState(false);

  useEffect(() => {
    if (!planId) {
      reset();
      setCreateReady(true);
    } else setCreateReady(false);
  }, [planId, reset]);

  if (planId) {
    return <ActivityPlanComposerScreen key={planId} mode="edit" planId={planId} />;
  }

  return createReady ? <ActivityPlanComposerScreen key="create" mode="create" /> : null;
}
