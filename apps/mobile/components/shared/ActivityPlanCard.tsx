import type { ActivityPlanStructureV2 } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Calendar } from "lucide-react-native";
import { View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { api } from "@/lib/api";
import { getActivityCategoryConfig, getActivityConfig } from "@/lib/constants/activities";
import { useResourceLike } from "@/lib/hooks/useResourceLike";
import { ActivityPlanSummary } from "./ActivityPlanSummary";
import type { EntityOwner } from "./EntityOwnerRow";
import {
  ResourceCardShell,
  ResourceLikeButton,
  ResourceOwnerActionRow,
} from "./ResourceCardPrimitives";

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
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  route?: {
    distance?: number | null;
    ascent?: number | null;
    descent?: number | null;
  } | null;
  route_id?: string | null;
  notes?: string | null;
  profile_id?: string | null;
  created_at?: string;
  updated_at?: string;
  likes_count?: number;
  has_liked?: boolean;
  owner?: EntityOwner | null;
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

type ActivityPlanCardRoute = {
  id?: string | null;
  name?: string | null;
  polyline?: string | null;
  total_distance?: number | null;
  distance?: number | null;
  total_ascent?: number | null;
  ascent?: number | null;
  total_descent?: number | null;
  descent?: number | null;
};

type ActivityPlanCardFullRoute = {
  coordinates?: Array<{ latitude: number; longitude: number; altitude?: number }>;
};

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
  createdAt?: string;
  updatedAt?: string;

  // Scheduling info (optional)
  scheduledDate?: string; // ISO date string
  isCompleted?: boolean;

  likes_count?: number;
  has_liked?: boolean;
  owner?: EntityOwner | null;
}

interface ActivityPlanCardProps {
  // New flexible prop: accepts activity_plan directly, or planned_activity with nested activity_plan
  activityPlan?: ActivityPlan;
  plannedActivity?: PlannedActivity;

  // Legacy support: accepts pre-formatted data
  activity?: ActivityPlanCardData;

  onPress?: () => void;
  loadRoutePreview?: boolean;
  route?: ActivityPlanCardRoute | null;
  routeFull?: ActivityPlanCardFullRoute | null;
  testID?: string;
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
  loadRoutePreview = false,
  onPress,
  route: routeProp,
  routeFull: routeFullProp,
  testID,
  variant = "default",
  showScheduleInfo = false,
}: ActivityPlanCardProps) {
  // Transform database objects to internal format
  const activity = legacyActivity || transformToCardData(activityPlan, plannedActivity);

  // Determine card size based on variant
  const isCompact = variant === "compact";
  const isHero = variant === "hero";
  const activityConfig = activity.activityType.includes("_")
    ? getActivityConfig(activity.activityType)
    : getActivityCategoryConfig(activity.activityType);

  const routeId = activity.routeId;
  const { data: fetchedRoute } = api.routes.get.useQuery(
    { id: routeId! },
    { enabled: loadRoutePreview && !!routeId && !routeProp },
  );
  const { data: routeFull } = api.routes.loadFull.useQuery(
    { id: routeId! },
    { enabled: loadRoutePreview && !!routeId && !routeFullProp },
  );
  const route = (routeProp ?? fetchedRoute ?? null) as ActivityPlanCardRoute | null;
  const resolvedRouteFull = routeFullProp ?? routeFull ?? null;

  const {
    isLiked,
    isPending: isLikePending,
    likeCount,
    toggleLike,
  } = useResourceLike({
    entityId: activity.id,
    entityType: "activity_plan",
    initialCount: activity.likes_count,
    initialLiked: activity.has_liked,
  });

  return (
    <ResourceCardShell
      cardClassName={activity.isCompleted ? "opacity-60" : undefined}
      compact={isCompact}
      contentClassName={isCompact ? "gap-3 px-2" : "gap-3 px-3"}
      highlighted={isHero}
      onPress={onPress}
      testID={testID ?? `activity-plan-card-${activity.id}`}
    >
      <ResourceOwnerActionRow
        actions={
          <ResourceLikeButton
            disabled={isLikePending}
            isLiked={isLiked}
            likeCount={likeCount}
            onPress={toggleLike}
          />
        }
        compact={isCompact}
        categoryIcon={activityConfig.icon}
        categoryIconClassName={activityConfig.color}
        categoryLabel={activityConfig.name}
        fallbackLabel="GradientPeak"
        owner={activity.owner}
        timestamp={activity.createdAt ?? activity.updatedAt}
      />

      <ActivityPlanSummary
        activityCategory={activity.activityType}
        description={activity.description || activity.notes || null}
        estimatedDuration={activity.estimatedDuration}
        estimatedTss={activity.estimatedTss}
        intensityFactor={activity.intensityFactor}
        owner={activity.owner}
        routeName={route?.name || activity.routeName}
        routeProvided={!!activity.routeId}
        structure={activity.structure}
        title={activity.name}
        variant="standalone"
        showAttribution={false}
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
          authoritative_metrics: {
            estimated_duration: activity.estimatedDuration,
            estimated_tss: activity.estimatedTss,
            intensity_factor: activity.intensityFactor,
            estimated_distance: activity.estimatedDistance,
          },
          route: {
            distance: activity.estimatedDistance,
          },
          route_id: activity.routeId,
          structure: activity.structure,
        }}
        route={
          route
            ? {
                ...route,
                total_distance: route.total_distance ?? route.distance ?? null,
                total_ascent: route.total_ascent ?? route.ascent ?? null,
                total_descent: route.total_descent ?? route.descent ?? null,
              }
            : null
        }
        routeFull={resolvedRouteFull ? { coordinates: resolvedRouteFull.coordinates ?? [] } : null}
        intensityFactor={activity.intensityFactor}
        tss={activity.estimatedTss}
        testIDPrefix={`activity-plan-card-preview-${activity.id}`}
      />
    </ResourceCardShell>
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
  const authoritativeMetrics = plan.authoritative_metrics;
  const planRoute = plan.route;

  return {
    id: plannedActivity?.id || plan.id,
    name: plan.name,
    activityType: plan.activity_category,
    description: plan.description || undefined,
    structure: plan.structure,
    estimatedDuration: authoritativeMetrics?.estimated_duration ?? undefined,
    estimatedTss: authoritativeMetrics?.estimated_tss ?? undefined,
    intensityFactor: authoritativeMetrics?.intensity_factor ?? undefined,
    estimatedDistance:
      authoritativeMetrics?.estimated_distance ?? planRoute?.distance ?? routeInfo?.distance,
    routeId: plan.route_id || undefined,
    routeName: routeInfo?.name,
    notes: plannedActivity?.notes || plan.description || plan.notes || undefined,
    createdAt: plan.created_at || undefined,
    updatedAt: plan.updated_at || undefined,
    scheduledDate: plannedActivity?.scheduled_date,
    isCompleted: Boolean(plannedActivity?.completed_activity_id),
    likes_count: plan.likes_count,
    has_liked: plan.has_liked,
    owner: plan.owner ?? null,
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
