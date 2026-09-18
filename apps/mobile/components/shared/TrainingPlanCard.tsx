import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { TrainingPlanPlannedSchedulePreview } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CalendarRange, MessageCircle, Share2 } from "lucide-react-native";
import { useMemo } from "react";
import { Alert, Share, View } from "react-native";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { getPublicShareUrl } from "@/lib/share/public-share-url";
import { deriveTrainingPlanSummaryMetrics } from "@/lib/trainingPlanVisual";
import {
  type ResourceCardAccessory,
  ResourceCardActionButton,
  ResourceCardHeader,
  ResourceCardShell,
  ResourceLikeButton,
  ResourceMetricsRow,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";
import { TrainingPlanPlannedPreview } from "./TrainingPlanPlannedPreview";

type TrainingPlanTemplateListItem =
  inferRouterOutputs<AppRouter>["trainingPlans"]["listTemplates"]["items"][number];
type TrainingPlanListItem = inferRouterOutputs<AppRouter>["trainingPlans"]["list"]["items"][number];

export type TrainingPlanCardPlan = Pick<TrainingPlanTemplateListItem, "id" | "name"> &
  Partial<Omit<TrainingPlanTemplateListItem, "created_at" | "id" | "name" | "updated_at">> &
  Partial<Pick<TrainingPlanListItem, "content_visibility" | "owner" | "structure">> & {
    created_at?: TrainingPlanTemplateListItem["created_at"] | TrainingPlanListItem["created_at"];
    updated_at?: TrainingPlanTemplateListItem["updated_at"] | TrainingPlanListItem["updated_at"];
    activity_category?: string[] | string | null;
    durationWeeks?: { min?: number | null; recommended?: number | null } | null;
    experienceLevel?: string[] | string | null;
    sessionsPerWeek?: number | null;
    plannedSchedulePreview?: TrainingPlanPlannedSchedulePreview | null;
  };

type TrainingPlanCardProps = {
  plan: TrainingPlanCardPlan;
  onPress?: () => void;
  onCommentPress?: () => void;
  commentCount?: number | null;
  headerAccessory?: ResourceCardAccessory;
  showAttribution?: boolean;
  testID?: string;
  variant?: "default" | "compact" | "list";
};

export function TrainingPlanCard({
  plan,
  onPress,
  onCommentPress,
  commentCount,
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
  const handleCommentPress = onCommentPress ?? onPress;
  const handleShare = async () => {
    if (plan.content_visibility !== "public") {
      Alert.alert(
        "Not public",
        "Only public training plans have a share link. Change visibility to Public first.",
      );
      return;
    }

    const url = getPublicShareUrl(`/share/training-plans/${plan.id}`);
    try {
      await Share.share({ message: url, url });
    } catch {
      Alert.alert("Unable to share", "The training plan could not be shared. Try again.");
    }
  };

  return (
    <ResourceCardShell
      accessibilityLabel={`Open training plan ${plan.name || "Untitled training plan"}`}
      {...(!isList
        ? {
            actionRegion: (
              <ResourceOwnerActionRow
                actions={
                  isCompact ? undefined : (
                    <>
                      {headerAccessory}
                      <ResourceCardActionButton
                        accessibilityLabel="Share training plan"
                        onPress={() => void handleShare()}
                        testID={`training-plan-card-share-button-${plan.id}`}
                      >
                        <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
                          <Icon as={Share2} size={14} className="text-muted-foreground" />
                          <Text className="ml-1 text-xs font-medium text-muted-foreground">
                            Share
                          </Text>
                        </View>
                      </ResourceCardActionButton>
                    </>
                  )
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

          {!isCompact ? (
            <View
              className="flex-row items-center gap-2"
              testID="training-plan-card-social-actions"
            >
              <ResourceLikeButton
                disabled={isLikePending}
                isLiked={isLiked}
                likeCount={likeCount}
                onPress={toggleLike}
                testID={`training-plan-card-like-button-${plan.id}`}
              />
              <ResourceCardActionButton
                accessibilityLabel={
                  commentCount && commentCount > 0 ? `Comments, ${commentCount}` : "Comments"
                }
                disabled={!handleCommentPress}
                onPress={handleCommentPress ?? (() => {})}
                testID={`training-plan-card-comments-button-${plan.id}`}
              >
                <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
                  <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
                  <Text className="ml-1 text-xs font-medium text-muted-foreground">
                    {commentCount && commentCount > 0 ? `Comments ${commentCount}` : "Comments"}
                  </Text>
                </View>
              </ResourceCardActionButton>
            </View>
          ) : null}
        </>
      )}
    </ResourceCardShell>
  );
}
