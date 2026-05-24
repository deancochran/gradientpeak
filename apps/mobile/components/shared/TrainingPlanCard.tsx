import { Text } from "@repo/ui/components/text";
import { CalendarRange } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import {
  deriveTrainingPlanSummaryMetrics,
  deriveTrainingPlanVisual,
} from "@/lib/trainingPlanVisual";
import type { EntityOwner } from "./EntityOwnerRow";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";
import { TrainingPlanPeriodizationPreview } from "./TrainingPlanPeriodizationPreview";

export interface TrainingPlanCardPlan {
  id: string;
  name: string;
  description?: string | null;
  sessions_per_week_target?: number | null;
  sessionsPerWeek?: number | null;
  durationWeeks?: {
    min?: number | null;
    recommended?: number | null;
  } | null;
  sport?: string[] | string | null;
  experienceLevel?: string[] | string | null;
  likes_count?: number | null;
  has_liked?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  owner?: EntityOwner | null;
}

type TrainingPlanCardProps = {
  plan: TrainingPlanCardPlan;
  onPress?: () => void;
  headerAccessory?: ReactNode;
  showAttribution?: boolean;
  variant?: "default" | "compact";
};

export function TrainingPlanCard({
  plan,
  onPress,
  headerAccessory,
  showAttribution = true,
  variant = "default",
}: TrainingPlanCardProps) {
  const isCompact = variant === "compact";
  const summaryMetrics = useMemo(() => deriveTrainingPlanSummaryMetrics(plan), [plan]);
  const visualModel = useMemo(
    () => deriveTrainingPlanVisual(plan, { compact: isCompact }),
    [isCompact, plan],
  );
  const {
    isLiked,
    isPending: isLikePending,
    likeCount,
    toggleLike,
  } = useResourceLike({
    entityId: plan.id,
    entityType: "training_plan",
    initialCount: plan.likes_count,
    initialLiked: plan.has_liked,
  });

  return (
    <ResourceCardShell compact={isCompact} onPress={onPress}>
      <ResourceOwnerActionRow
        actions={
          <>
            {headerAccessory}
            <ResourceLikeButton
              disabled={isLikePending}
              isLiked={isLiked}
              likeCount={likeCount}
              onPress={toggleLike}
              testID={`training-plan-card-like-button-${plan.id}`}
            />
          </>
        }
        categoryIcon={CalendarRange}
        categoryIconClassName="text-primary"
        categoryLabel="Training plan"
        compact={isCompact}
        fallbackLabel="GradientPeak"
        owner={showAttribution ? (plan.owner ?? null) : null}
        timestamp={showAttribution ? (plan.created_at ?? plan.updated_at ?? null) : null}
      />

      <ResourceCardHeader
        compact={isCompact}
        description={plan.description}
        descriptionFallback="Structured plan template with enough detail to preview before scheduling."
        descriptionNumberOfLines={isCompact ? 2 : undefined}
        title={plan.name}
        titleFallback="Untitled training plan"
      />

      <ResourceMetricsRow
        compact={isCompact}
        metrics={[
          { label: "Duration", value: summaryMetrics.durationLabel },
          { label: "Sessions", value: summaryMetrics.sessionsLabel },
          { label: "Sport", value: summaryMetrics.sportLabel },
          { label: "Level", value: summaryMetrics.experienceLabel },
        ]}
      />

      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">Plan snapshot</Text>
        <TrainingPlanPeriodizationPreview compact={isCompact} model={visualModel} />
      </View>
    </ResourceCardShell>
  );
}
