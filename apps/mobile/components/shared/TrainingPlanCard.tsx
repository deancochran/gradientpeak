import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CalendarRange, Heart } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";
import {
  deriveTrainingPlanSummaryMetrics,
  deriveTrainingPlanVisual,
} from "@/lib/trainingPlanVisual";
import { ActivityPlanAttributionRow } from "./ActivityPlanAttributionRow";
import type { EntityOwner } from "./EntityOwnerRow";
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

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-[11px] font-semibold capitalize text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function TrainingPlanCard({
  plan,
  onPress,
  headerAccessory,
  showAttribution = true,
  variant = "default",
}: TrainingPlanCardProps) {
  const isCompact = variant === "compact";
  const Wrapper = onPress ? TouchableOpacity : View;
  const [isLiked, setIsLiked] = useState(plan.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(plan.likes_count ?? 0);
  const summaryMetrics = useMemo(() => deriveTrainingPlanSummaryMetrics(plan), [plan]);
  const visualModel = useMemo(
    () => deriveTrainingPlanVisual(plan, { compact: isCompact }),
    [isCompact, plan],
  );

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan.has_liked ?? false);
      setLikesCount(plan.likes_count ?? 0);
    },
  });

  const handleToggleLike = () => {
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : Math.max(prev - 1, 0)));
    toggleLikeMutation.mutate({
      entity_id: plan.id,
      entity_type: "training_plan",
    });
  };

  return (
    <Wrapper onPress={onPress} activeOpacity={onPress ? 0.85 : 1} disabled={!onPress}>
      <Card className={isCompact ? "py-2" : "py-3"}>
        <CardContent className={isCompact ? "px-2" : "px-3"}>
          <View className="flex-row items-start gap-3">
            <View className="rounded-full bg-primary/10 p-2.5">
              <Icon as={CalendarRange} size={18} className="text-primary" />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text
                className={`${isCompact ? "text-lg" : "text-xl"} font-semibold text-foreground`}
              >
                {plan.name}
              </Text>
              <Text
                className="text-sm leading-5 text-muted-foreground"
                numberOfLines={isCompact ? 2 : undefined}
              >
                {plan.description?.trim() ||
                  "Structured plan template with enough detail to preview before scheduling."}
              </Text>
            </View>
            {headerAccessory ?? (
              <Pressable
                onPress={(event) => {
                  event?.stopPropagation?.();
                  handleToggleLike();
                }}
                className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5"
                testID={`training-plan-card-like-button-${plan.id}`}
              >
                <Icon
                  as={Heart}
                  size={14}
                  className={isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
                />
                <Text className="ml-1 text-xs font-medium text-muted-foreground">
                  {likesCount > 0 ? `${likesCount}` : isLiked ? "Liked" : "Like"}
                </Text>
              </Pressable>
            )}
          </View>

          <View className="mt-3 rounded-lg bg-muted/30 px-2.5 py-2">
            <View className="flex-row justify-between gap-2">
              <MetricCell label="Duration" value={summaryMetrics.durationLabel} />
              <MetricCell label="Sessions" value={summaryMetrics.sessionsLabel} />
              <MetricCell label="Sport" value={summaryMetrics.sportLabel} />
              <MetricCell label="Level" value={summaryMetrics.experienceLabel} />
            </View>
          </View>

          <View className="mt-3 gap-2">
            <Text className="text-sm font-medium text-foreground">Plan snapshot</Text>
            <TrainingPlanPeriodizationPreview compact={isCompact} model={visualModel} />
          </View>

          {showAttribution ? (
            <ActivityPlanAttributionRow
              compact={isCompact}
              owner={plan.owner ?? null}
              updatedAt={plan.updated_at ?? plan.created_at ?? null}
            />
          ) : null}
        </CardContent>
      </Card>
    </Wrapper>
  );
}
