import type { TrainingPlanPlannedSchedulePreview } from "@repo/core";
import { CalendarRange } from "lucide-react-native";
import { useMemo } from "react";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { deriveTrainingPlanSummaryMetrics } from "@/lib/trainingPlanVisual";
import type { EntityOwner } from "./EntityOwnerRow";
import {
  type ResourceCardAccessory,
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";
import { TrainingPlanPlannedPreview } from "./TrainingPlanPlannedPreview";

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
  activity_category?: string[] | string | null;
  experienceLevel?: string[] | string | null;
  likes_count?: number | null;
  has_liked?: boolean | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  owner?: EntityOwner | null;
  structure?: unknown;
  plannedSchedulePreview?: TrainingPlanPlannedSchedulePreview | null;
}

type TrainingPlanCardProps = {
  plan: TrainingPlanCardPlan;
  onPress?: () => void;
  headerAccessory?: ResourceCardAccessory;
  showAttribution?: boolean;
  testID?: string;
  variant?: "default" | "compact" | "list";
};

export function TrainingPlanCard({
  plan,
  onPress,
  headerAccessory,
  showAttribution = true,
  testID,
  variant = "default",
}: TrainingPlanCardProps) {
  const isList = variant === "list";
  const isCompact = variant === "compact";
  const summaryMetrics = useMemo(() => deriveTrainingPlanSummaryMetrics(plan), [plan]);
  const {
    isLiked,
    isPending: isLikePending,
    likeCount,
    toggleLike,
  } = useResourceLike({
    entityId: plan.id,
    entityType: "training_plan",
    ...(plan.likes_count !== undefined ? { initialCount: plan.likes_count } : {}),
    ...(plan.has_liked !== undefined ? { initialLiked: plan.has_liked } : {}),
  });

  return (
    <ResourceCardShell
      accessibilityLabel={`Open training plan ${plan.name || "Untitled training plan"}`}
      {...(!isList
        ? {
            actionRegion: (
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
            ),
          }
        : {})}
      compact={isCompact || isList}
      {...(onPress !== undefined ? { onPress } : {})}
      testID={testID ?? `training-plan-card-${plan.id}`}
    >
      {isList ? (
        <>
          <ResourceCardHeader
            compact
            icon={CalendarRange}
            title={plan.name}
            titleFallback="Untitled training plan"
            titleNumberOfLines={1}
          />
          <ResourceMetricsRow
            compact
            maxItems={3}
            metrics={[
              { label: "Duration", value: summaryMetrics.durationLabel },
              { label: "Sessions", value: summaryMetrics.sessionsLabel },
              { label: "Activity category", value: summaryMetrics.activityCategoryLabel },
              { label: "Level", value: summaryMetrics.experienceLabel },
            ]}
          />
        </>
      ) : (
        <>
          <ResourceCardHeader
            compact={isCompact}
            {...(plan.description !== undefined ? { description: plan.description } : {})}
            descriptionFallback="Structured plan template with enough detail to preview before scheduling."
            {...(isCompact ? { descriptionNumberOfLines: 2 } : {})}
            title={plan.name}
            titleFallback="Untitled training plan"
          />

          <ResourceMetricsRow
            compact={isCompact}
            metrics={[
              { label: "Duration", value: summaryMetrics.durationLabel },
              { label: "Sessions", value: summaryMetrics.sessionsLabel },
              { label: "Activity category", value: summaryMetrics.activityCategoryLabel },
              { label: "Level", value: summaryMetrics.experienceLabel },
            ]}
          />

          <TrainingPlanPlannedPreview
            compact={isCompact}
            planId={plan.id}
            {...(plan.plannedSchedulePreview !== undefined
              ? { preview: plan.plannedSchedulePreview }
              : {})}
            structure={plan.structure}
          />
        </>
      )}
    </ResourceCardShell>
  );
}
