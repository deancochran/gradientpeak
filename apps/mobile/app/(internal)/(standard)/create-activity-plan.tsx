import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityPlanComposerScreen } from "@/components/activity-plan/ActivityPlanComposerScreen";
import { useCreationFlowActive } from "@/lib/hooks/useCreationFlowActive";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

const activityCategories = ["bike", "run", "swim", "strength", "other"] as const;
type ActivityCategory = (typeof activityCategories)[number];

function readInitialActivityCategory(value: string | undefined): ActivityCategory | undefined {
  return activityCategories.includes(value as ActivityCategory)
    ? (value as ActivityCategory)
    : undefined;
}

export default function CreateActivityPlanRoute() {
  const { planId, activityCategory, activity_category } = useLocalSearchParams<{
    activityCategory?: string;
    activity_category?: string;
    planId?: string;
  }>();
  const initialActivityCategory = readInitialActivityCategory(
    activityCategory ?? activity_category,
  );
  const reset = useActivityPlanCreationStore((state) => state.reset);
  const flow = useCreationFlowActive(["create-activity-plan"], false, {
    onExit: reset,
    ownerKey: planId ?? "create",
  });
  const active = flow.active;
  const [readyOwner, setReadyOwner] = useState<string | null>(null);
  const owner = `${planId ?? "create"}:${flow.key}`;

  useEffect(() => {
    reset();
    setReadyOwner(active ? owner : null);
    return active ? reset : undefined;
  }, [active, owner, reset]);

  if (!active || readyOwner !== owner) return null;

  if (planId) {
    return (
      <ActivityPlanComposerScreen
        key={owner}
        mode="edit"
        planId={planId}
        isFlowCurrent={flow.isCurrent}
      />
    );
  }

  return (
    <ActivityPlanComposerScreen
      key={owner}
      mode="create"
      {...(initialActivityCategory ? { initialActivityCategory } : {})}
      isFlowCurrent={flow.isCurrent}
    />
  );
}
