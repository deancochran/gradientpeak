import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getActivityConfig } from "@/lib/constants/activities";
import { formatDuration } from "@/lib/utils/dates";
import type { ActivityPlanStructureV2 } from "@repo/core";
import { format } from "date-fns";
import {
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Zap,
} from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

// ============================================
// TYPES
// ============================================

// Database object types
export interface ActivityPlan {
  id: string;
  name: string;
  activity_category: string;
  activity_location: string;
  description?: string | null;
  structure?: ActivityPlanStructureV2;
  estimated_duration?: number | null; // in minutes
  estimated_tss?: number | null;
  route_id?: string | null;
  notes?: string | null;
  profile_id?: string | null;
  created_at?: string;
  updated_at?: string;
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
  structure?: ActivityPlanStructureV2;
  estimatedDuration?: number; // in minutes
  estimatedTss?: number;
  estimatedDistance?: number; // in km, if route provided
  routeId?: string;
  routeName?: string;
  notes?: string;

  // Scheduling info (optional)
  scheduledDate?: string; // ISO date string
  isCompleted?: boolean;
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
  const activity =
    legacyActivity || transformToCardData(activityPlan, plannedActivity);

  const config = getActivityConfig(activity.activityType);

  // Check if has structure with steps/intervals
  const hasStructure = Boolean(
    activity.structure?.intervals && activity.structure.intervals.length > 0,
  );

  // Determine if interactive
  const isInteractive = Boolean(onPress);

  // Determine card size based on variant
  const isCompact = variant === "compact";
  const isHero = variant === "hero";

  const CardWrapper = isInteractive ? TouchableOpacity : View;

  return (
    <CardWrapper
      onPress={onPress}
      activeOpacity={isInteractive ? 0.7 : 1}
      disabled={!isInteractive}
    >
      <Card
        className={`${isHero ? "border-2 border-primary" : ""} ${activity.isCompleted ? "opacity-60" : ""}`}
      >
        <CardContent className={`${isCompact ? "p-3" : "p-4"}`}>
          {/* Header Row: Icon + Title + Schedule Badge */}
          <View className="flex-row items-start mb-3">
            {/* Activity Icon */}
            <View
              className={`${isCompact ? "w-10 h-10" : "w-12 h-12"} rounded-full ${config.bgColor} items-center justify-center mr-3 shrink-0`}
            >
              <Icon
                as={config.icon}
                size={isCompact ? 20 : 24}
                className={config.color}
              />
            </View>

            {/* Title and Type */}
            <View className="flex-1 min-w-0">
              <Text
                className={`font-semibold ${isCompact ? "text-sm" : "text-base"} mb-1`}
                numberOfLines={2}
              >
                {activity.name}
              </Text>
              <Text className="text-xs text-muted-foreground capitalize">
                {config.name}
              </Text>
            </View>

            {/* Completed Badge */}
            {activity.isCompleted && (
              <View className="ml-2 shrink-0">
                <Icon as={CheckCircle2} size={20} className="text-green-600" />
              </View>
            )}
          </View>

          {/* Schedule Info Badge (if scheduled) */}
          {showScheduleInfo && activity.scheduledDate && (
            <View className="flex-row items-center bg-muted/50 rounded-lg px-2 py-1.5 mb-3">
              <Icon
                as={Calendar}
                size={12}
                className="text-muted-foreground mr-1.5"
              />
              <Text className="text-xs text-muted-foreground">
                {formatScheduledDateTime(activity.scheduledDate)}
              </Text>
            </View>
          )}

          {/* Intensity Profile Chart */}
          {hasStructure && !activity.isCompleted && activity.structure && (
            <View className="mb-3 rounded-lg overflow-hidden bg-muted/20">
              <TimelineChart
                structure={activity.structure}
                height={isHero ? 120 : isCompact ? 60 : 80}
                compact={!isHero}
              />
            </View>
          )}

          {/* Route Badge (if has route) */}
          {activity.routeId && (
            <View className="flex-row items-center bg-blue-50 dark:bg-blue-950 rounded-lg px-2 py-1.5 mb-3">
              <Icon as={MapPin} size={14} className="text-blue-600 mr-1.5" />
              <Text
                className="text-xs text-blue-600 font-medium flex-1"
                numberOfLines={1}
              >
                {activity.routeName || "Route attached"}
              </Text>
              {activity.estimatedDistance && (
                <Text className="text-xs text-blue-600 font-semibold ml-2">
                  {activity.estimatedDistance.toFixed(1)} km
                </Text>
              )}
            </View>
          )}

          {/* Notes (if provided and not compact) */}
          {activity.notes && !isCompact && (
            <View className="bg-muted/30 rounded-lg px-3 py-2 mb-3">
              <Text
                className="text-xs text-muted-foreground italic"
                numberOfLines={2}
              >
                {activity.notes}
              </Text>
            </View>
          )}

          {/* Metadata Row */}
          <View className="flex-row items-center flex-wrap gap-3">
            {/* Duration */}
            {activity.estimatedDuration !== undefined &&
              activity.estimatedDuration > 0 && (
                <View className="flex-row items-center">
                  <Icon
                    as={Clock}
                    size={14}
                    className="text-muted-foreground mr-1"
                  />
                  <Text
                    className={`text-muted-foreground ${isCompact ? "text-xs" : "text-sm"}`}
                  >
                    {formatDuration(activity.estimatedDuration)}
                  </Text>
                </View>
              )}

            {/* TSS */}
            {activity.estimatedTss !== undefined &&
              activity.estimatedTss > 0 && (
                <View className="flex-row items-center">
                  <Icon
                    as={Zap}
                    size={14}
                    className="text-muted-foreground mr-1"
                  />
                  <Text
                    className={`text-muted-foreground ${isCompact ? "text-xs" : "text-sm"}`}
                  >
                    {Math.round(activity.estimatedTss)} TSS
                  </Text>
                </View>
              )}

            {/* Distance (if route and not already shown) */}
            {!activity.routeId &&
              activity.estimatedDistance &&
              activity.estimatedDistance > 0 && (
                <View className="flex-row items-center">
                  <Icon
                    as={MapPin}
                    size={14}
                    className="text-muted-foreground mr-1"
                  />
                  <Text
                    className={`text-muted-foreground ${isCompact ? "text-xs" : "text-sm"}`}
                  >
                    {activity.estimatedDistance.toFixed(1)} km
                  </Text>
                </View>
              )}
          </View>
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
    structure: plan.structure,
    estimatedDuration: plan.estimated_duration || undefined,
    estimatedTss: plan.estimated_tss || undefined,
    estimatedDistance: routeInfo?.distance,
    routeId: plan.route_id || undefined,
    routeName: routeInfo?.name,
    notes: plannedActivity?.notes || plan.notes || undefined,
    scheduledDate: plannedActivity?.scheduled_date,
    isCompleted: Boolean(plannedActivity?.completed_activity_id),
  };
}

/**
 * Format scheduled date/time for compact display
 */
function formatScheduledDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activityDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const diffDays = Math.floor(
    (activityDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

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
