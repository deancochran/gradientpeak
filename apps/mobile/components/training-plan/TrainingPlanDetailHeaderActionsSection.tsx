import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { TrainingPlanPlannedSchedulePreview as TrainingPlanPlannedSchedulePreviewModel } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { MessageCircle, Share2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  ResourceCardActionButton,
  ResourceLikeButton,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { TrainingPlanPlannedPreview } from "@/components/shared/TrainingPlanPlannedPreview";
import { markEstimated } from "@/lib/estimatedMetrics";
import { deriveTrainingPlanSummaryMetrics } from "@/lib/trainingPlanVisual";
import { TrainingPlanSummaryHeader } from "./TrainingPlanSummaryHeader";

interface TrainingPlanDetailHeaderActionsSectionProps {
  handleToggleLike: () => void | Promise<void>;
  handleShare: () => void | Promise<void>;
  shareDisabled?: boolean;
  isScheduledPlan?: boolean;
  isLiked: boolean;
  likesCount: number;
  commentCount: number;
  onCommentsPress: () => void;
  overview?: {
    linkedActivities: number;
    microcycles: number;
    plannedTime: string;
    plannedLoad: number;
    sessions: number;
  };
  plan: TrainingPlanDetailHeaderPlan;
}

type TrainingPlanDetailOutput = inferRouterOutputs<AppRouter>["trainingPlans"]["get"];

type TrainingPlanDetailHeaderPlan = Omit<
  Pick<
    TrainingPlanDetailOutput,
    "created_at" | "description" | "id" | "name" | "owner" | "structure"
  >,
  "created_at" | "description" | "id" | "owner" | "structure"
> & {
  created_at: string | Date;
  description?: TrainingPlanDetailOutput["description"];
  id?: string;
  owner?: TrainingPlanDetailOutput["owner"];
  plannedSchedulePreview?: TrainingPlanPlannedSchedulePreviewModel | null;
  structure?: TrainingPlanDetailOutput["structure"];
};

export function TrainingPlanDetailHeaderActionsSection({
  handleToggleLike,
  handleShare,
  shareDisabled = false,
  isScheduledPlan = false,
  isLiked,
  likesCount,
  commentCount,
  onCommentsPress,
  overview,
  plan,
}: TrainingPlanDetailHeaderActionsSectionProps) {
  const summaryMetrics = useMemo(() => deriveTrainingPlanSummaryMetrics(plan), [plan]);
  const [likePending, setLikePending] = useState(false);

  const handleLikePress = async () => {
    if (likePending) return;
    setLikePending(true);
    try {
      await handleToggleLike();
    } finally {
      setLikePending(false);
    }
  };

  return (
    <View className="gap-4 rounded-3xl border border-border bg-card p-4">
      <ResourceOwnerActionRow
        actions={
          <ResourceCardActionButton
            accessibilityLabel="Share training plan"
            disabled={shareDisabled}
            onPress={() => void handleShare()}
            testID="training-plan-share-button"
          >
            <Icon as={Share2} size={20} className="text-foreground" />
          </ResourceCardActionButton>
        }
        categoryLabel={isScheduledPlan ? "Scheduled program" : "Program template"}
        fallbackLabel="GradientPeak"
        owner={plan?.owner ?? null}
        timestamp={plan.created_at}
      />

      <TrainingPlanSummaryHeader
        title={plan.name}
        {...(plan.description ? { description: plan.description } : {})}
        isActive={isScheduledPlan}
        activeLabel="Scheduled"
        inactiveLabel="Program template"
        createdAt={
          plan.created_at instanceof Date ? plan.created_at.toISOString() : plan.created_at
        }
        showStatusDot={isScheduledPlan}
        formatStartedDate={(date) =>
          date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        }
        showMeta={false}
      />

      <View className="flex-row items-center gap-2">
        <ResourceLikeButton
          disabled={likePending}
          isLiked={isLiked}
          likeCount={likesCount}
          onPress={() => void handleLikePress()}
          testID="training-plan-like-button"
        />
        <ResourceCardActionButton
          accessibilityLabel={`Comments, ${commentCount}`}
          onPress={onCommentsPress}
          testID="training-plan-comments-button"
        >
          <View className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5">
            <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
            <Text className="ml-1 text-xs font-medium text-muted-foreground">
              {commentCount > 0 ? commentCount : "Comments"}
            </Text>
          </View>
        </ResourceCardActionButton>
      </View>

      {isScheduledPlan ? (
        <View className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3">
          <Text className="text-sm font-medium text-foreground">
            This program has future sessions on your calendar.
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Removing the scheduled set keeps completed sessions in history.
          </Text>
        </View>
      ) : null}

      <View className="rounded-lg bg-muted/30 px-2.5 py-2">
        <View className="flex-row justify-between gap-2">
          <SummaryMetricCard label="Duration" value={summaryMetrics.durationLabel} compact />
          <SummaryMetricCard label="Sessions" value={summaryMetrics.sessionsLabel} compact />
          <SummaryMetricCard
            label="Activity category"
            value={summaryMetrics.activityCategoryLabel}
            compact
          />
          <SummaryMetricCard label="Level" value={summaryMetrics.experienceLabel} compact />
        </View>
      </View>

      <TrainingPlanPlannedPreview
        planId={typeof plan.id === "string" ? plan.id : "detail"}
        {...(plan.plannedSchedulePreview !== undefined
          ? { preview: plan.plannedSchedulePreview }
          : {})}
        structure={plan.structure}
      />

      {overview ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-foreground">Plan overview</Text>
          <View className="flex-row flex-wrap gap-2">
            <SummaryMetricCard label="Microcycles" value={`${overview.microcycles}`} />
            <SummaryMetricCard label="Sessions" value={`${overview.sessions}`} />
            <SummaryMetricCard label="Linked activities" value={`${overview.linkedActivities}`} />
            <SummaryMetricCard
              label="Planned Load"
              value={markEstimated(`${overview.plannedLoad}`) ?? "0"}
            />
            <SummaryMetricCard label="Planned time" value={overview.plannedTime} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SummaryMetricCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View
      className={
        compact
          ? "flex-1 items-center gap-0.5"
          : "min-w-[30%] flex-1 rounded-xl border border-border/50 bg-muted/10 px-2.5 py-2"
      }
    >
      <Text
        className={
          compact
            ? "text-[10px] text-muted-foreground"
            : "text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        }
      >
        {label}
      </Text>
      <Text
        className={
          compact
            ? "text-[11px] font-semibold text-foreground"
            : "mt-0.5 text-sm font-semibold text-foreground"
        }
      >
        {value}
      </Text>
    </View>
  );
}
