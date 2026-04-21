import type { ActivityPlanStructureV2 } from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Calendar, Heart } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { api } from "@/lib/api";
import { getActivityCategoryConfig, getActivityConfig } from "@/lib/constants/activities";
import { ActivityPlanSummary } from "./ActivityPlanSummary";

// ============================================
// TYPES
// ============================================

// Database object types
export interface ActivityPlan {
  id: string;
  name: string;
  activity_category: string;
  description?: string | null;
  structure?: ActivityPlanStructureV2;
  estimated_duration?: number | null; // in seconds
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  route_id?: string | null;
  notes?: string | null;
  profile_id?: string | null;
  created_at?: string;
  updated_at?: string;
  likes_count?: number;
  has_liked?: boolean;
}

export interface PlannedActivity {
  id: string;
  activity_plan_id: string;
  activity_plan?: ActivityPlan;
  scheduled_date: string;
  notes?: string | null;
  completed_activity_id?: string | null;
  profile_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Legacy data interface (for backwards compatibility)
export interface ActivityPlanCardData {
  id: string;
  name: string;
  activityType: string; // activity_category
  description?: string;
  structure?: ActivityPlanStructureV2;
  estimatedDuration?: number; // in seconds
  estimatedTss?: number;
  intensityFactor?: number;
  estimatedDistance?: number; // in km, if route provided
  routeId?: string;
  routeName?: string;
  notes?: string;

  // Scheduling info (optional)
  scheduledDate?: string; // ISO date string
  isCompleted?: boolean;

  likes_count?: number;
  has_liked?: boolean;
}

interface ActivityPlanCardProps {
  // New flexible prop: accepts activity_plan directly, or planned_activity with nested activity_plan
  activityPlan?: ActivityPlan;
  plannedActivity?: PlannedActivity;

  // Legacy support: accepts pre-formatted data
  activity?: ActivityPlanCardData;

  onPress?: () => void;
  variant?: "default" | "compact" | "hero";
  showScheduleInfo?: boolean; // Show date/time badge
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ActivityPlanCard({
  activityPlan,
  plannedActivity,
  activity: legacyActivity,
  onPress,
  variant = "default",
  showScheduleInfo = false,
}: ActivityPlanCardProps) {
  // Transform database objects to internal format
  const activity = legacyActivity || transformToCardData(activityPlan, plannedActivity);

  const config =
    activity.activityType in { run: true, bike: true, swim: true, strength: true, other: true }
      ? getActivityCategoryConfig(activity.activityType)
      : getActivityConfig(activity.activityType);

  // Determine if interactive
  const isInteractive = Boolean(onPress);

  // Determine card size based on variant
  const isCompact = variant === "compact";
  const isHero = variant === "hero";

  const CardWrapper = isInteractive ? TouchableOpacity : View;

  const [isLiked, setIsLiked] = useState(activity.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(activity.likes_count ?? 0);
  const routeId = activity.routeId;
  const { data: route } = api.routes.get.useQuery({ id: routeId! }, { enabled: !!routeId });
  const { data: routeFull } = api.routes.loadFull.useQuery(
    { id: routeId! },
    { enabled: !!routeId },
  );

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      // Revert optimistic update on error
      setIsLiked(activity.has_liked ?? false);
      setLikesCount(activity.likes_count ?? 0);
    },
  });

  const handleToggleLike = () => {
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: activity.id,
      entity_type: "activity_plan",
    });
  };

  return (
    <CardWrapper
      onPress={onPress}
      activeOpacity={isInteractive ? 0.7 : 1}
      disabled={!isInteractive}
      testID={`activity-plan-card-${activity.id}`}
    >
      <Card
        className={`${isHero ? "border-2 border-primary" : ""} ${activity.isCompleted ? "opacity-60" : ""}`}
      >
        <CardContent className={isCompact ? "p-3" : "p-4"}>
          <ActivityPlanSummary
            activityCategory={activity.activityType}
            description={isCompact ? null : activity.description || activity.notes || null}
            estimatedDuration={activity.estimatedDuration}
            estimatedTss={activity.estimatedTss}
            headerAccessory={
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleLike();
                }}
                className="flex-row items-center rounded-full bg-muted px-2.5 py-1.5"
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
            }
            intensityFactor={activity.intensityFactor}
            routeName={route?.name || activity.routeName}
            routeProvided={!!activity.routeId}
            structure={activity.structure}
            title={activity.name}
            variant="standalone"
          />

          {showScheduleInfo && activity.scheduledDate && (
            <View className="mb-2 mt-3 flex-row items-center">
              <Icon as={Calendar} size={12} className="text-muted-foreground mr-1.5" />
              <Text className="text-xs text-muted-foreground">
                {formatScheduledDateTime(activity.scheduledDate)}
              </Text>
            </View>
          )}

          <ActivityPlanContentPreview
            compact={isCompact}
            size={isCompact ? "small" : isHero ? "large" : "medium"}
            plan={{
              estimated_duration: activity.estimatedDuration,
              estimated_tss: activity.estimatedTss,
              route_id: activity.routeId,
              structure: activity.structure,
            }}
            route={
              route ? { ...route, total_distance: (route as any).total_distance ?? null } : null
            }
            routeFull={routeFull ? { coordinates: (routeFull as any).coordinates ?? [] } : null}
            intensityFactor={activity.intensityFactor}
            tss={activity.estimatedTss}
            testIDPrefix={`activity-plan-card-preview-${activity.id}`}
          />
        </CardContent>
      </Card>
    </CardWrapper>
  );
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Transform database objects to internal card data format
 */
function transformToCardData(
  activityPlan?: ActivityPlan,
  plannedActivity?: PlannedActivity,
): ActivityPlanCardData {
  // Determine the source of activity_plan data
  const plan = plannedActivity?.activity_plan || activityPlan;

  if (!plan) {
    throw new Error(
      "ActivityPlanCard: Either activityPlan or plannedActivity with nested activity_plan must be provided",
    );
  }

  // Extract route info from structure if available
  const routeInfo = (plan.structure as any)?.route;

  return {
    id: plannedActivity?.id || plan.id,
    name: plan.name,
    activityType: plan.activity_category,
    description: plan.description || undefined,
    structure: plan.structure,
    estimatedDuration: plan.estimated_duration || undefined,
    estimatedTss: plan.estimated_tss || undefined,
    intensityFactor: plan.intensity_factor || undefined,
    estimatedDistance: routeInfo?.distance,
    routeId: plan.route_id || undefined,
    routeName: routeInfo?.name,
    notes: plannedActivity?.notes || plan.description || plan.notes || undefined,
    scheduledDate: plannedActivity?.scheduled_date,
    isCompleted: Boolean(plannedActivity?.completed_activity_id),
    likes_count: plan.likes_count,
    has_liked: plan.has_liked,
  };
}

/**
 * Format scheduled date/time for compact display
 */
function formatScheduledDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.floor((activityDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  // Check if time component exists (not midnight)
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;

  // Format date part
  let datePart = "";
  if (diffDays === 0) datePart = "Today";
  else if (diffDays === 1) datePart = "Tomorrow";
  else if (diffDays === -1) datePart = "Yesterday";
  else if (diffDays > 1 && diffDays < 7) datePart = format(date, "EEEE");
  else datePart = format(date, "MMM d");

  // Add time if specified
  if (hasTime) {
    const timePart = format(date, "h:mm a");
    return `${datePart} • ${timePart}`;
  }

  return datePart;
}
