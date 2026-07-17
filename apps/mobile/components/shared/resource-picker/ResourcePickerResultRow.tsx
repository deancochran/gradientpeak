import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Check, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { RouteCard } from "@/components/shared/RouteCard";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";
import { getActivityCategoryConfig } from "@/lib/constants/activities";
import { formatDistanceMeters, formatElevationMeters } from "@/lib/display/formatters";
import { formatEstimatedDurationSeconds, formatEstimatedTss } from "@/lib/estimatedMetrics";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import type { ResourcePickerItem, ResourcePickerScope } from "./resourcePickerTypes";

type ActivityPlanPickerSource = NonNullable<
  Parameters<typeof getAuthoritativeActivityPlanMetrics>[0]
> & {
  categories?: readonly string[];
  primary_category?: string | null;
  structure?: unknown;
  created_at?: string | null;
  description?: string | null;
  has_liked?: boolean | null;
  id: string;
  is_system_template?: boolean | null;
  likes_count?: number | null;
  name: string;
  template_visibility?: string | null;
  updated_at?: string | null;
};

type RoutePickerSource = {
  activity_category?: string | null;
  description?: string | null;
  has_liked?: boolean | null;
  id: string;
  is_public?: boolean | null;
  is_system_template?: boolean | null;
  likes_count?: number | null;
  name: string;
  total_ascent?: number | null;
  total_descent?: number | null;
  total_distance?: number | null;
};

function getVisibilityLabel(item: ResourcePickerItem) {
  if (item.isSystem) return "System";
  if (item.isPublic) return "Public";
  return "Private or shared";
}

type ResourcePickerResultRowProps = {
  disabled?: boolean;
  isSelected: boolean;
  item: ResourcePickerItem;
  onPress: () => void;
  scope: ResourcePickerScope;
};

export function ResourcePickerResultRow({
  disabled = false,
  isSelected,
  item,
  onPress,
  scope,
}: ResourcePickerResultRowProps) {
  const preferredUnitSystem = usePreferredUnitSystem();
  const isActivityPlan = scope === "activityPlans";
  const card =
    item.presentation === "canonical" && isActivityPlan && "activityPlanCardData" in item ? (
      <ActivityPlanCard
        activity={{
          activityType: item.activityPlanCardData.activityType,
          createdAt: item.activityPlanCardData.createdAt ?? undefined,
          description: item.activityPlanCardData.description ?? undefined,
          estimatedDuration: item.activityPlanCardData.estimatedDuration ?? undefined,
          estimatedTss: item.activityPlanCardData.estimatedTss ?? undefined,
          has_liked: item.activityPlanCardData.hasLiked ?? undefined,
          id: item.activityPlanCardData.id,
          likes_count: item.activityPlanCardData.likesCount ?? undefined,
          name: item.activityPlanCardData.name,
          updatedAt: item.activityPlanCardData.updatedAt ?? undefined,
        }}
        variant="list"
      />
    ) : item.presentation === "canonical" && scope === "routes" && "routeCardData" in item ? (
      <RouteCard
        route={item.routeCardData}
        showAttribution={false}
        showLike={false}
        variant="list"
      />
    ) : null;

  if (card) {
    return (
      <Pressable
        accessibilityLabel={`Select ${item.name || "resource"}`}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: isSelected }}
        className="relative min-h-11 rounded-xl"
        disabled={disabled}
        onPress={onPress}
        testID={`resource-picker-result-${item.id}`}
      >
        {card}
        {isSelected ? (
          <View
            className="absolute right-3 top-3 rounded-full bg-primary p-1"
            pointerEvents="none"
            testID={`resource-picker-result-selected-${item.id}`}
          >
            <Icon as={Check} size={14} className="text-primary-foreground" />
          </View>
        ) : null}
      </Pressable>
    );
  }

  if (item.presentation !== "external") return null;

  // This is intentionally limited to imported/external results that cannot provide
  // canonical card data. All in-app activity-plan and route query mappers use cards.
  const activityConfig = getActivityCategoryConfig(item.activityCategory || "other");
  const metadata =
    scope === "routes"
      ? [
          getVisibilityLabel(item),
          formatDistanceMeters(item.totalDistance, { fallback: "", preferredUnitSystem }),
          item.totalAscent
            ? `${formatElevationMeters(item.totalAscent, { preferredUnitSystem })} climb`
            : null,
        ]
      : [
          activityConfig.name,
          formatEstimatedDurationSeconds(item.estimatedDuration),
          formatEstimatedTss(item.estimatedTss),
        ];
  const accessibilityLabel = ["Select", item.name || "resource", ...metadata]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: isSelected }}
      className={`min-h-11 rounded-2xl border p-3 ${
        isSelected ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
      disabled={disabled}
      onPress={onPress}
      testID={`resource-picker-result-${item.id}`}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${activityConfig.bgColor}`}
        >
          {scope === "routes" ? (
            <Icon as={MapPin} size={18} className={activityConfig.color} />
          ) : (
            <Icon as={activityConfig.icon} size={18} className={activityConfig.color} />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {item.name || "Untitled"}
          </Text>
          {item.description ? (
            <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          <Text className="mt-1 text-xs text-muted-foreground">
            {metadata.filter(Boolean).join(" · ")}
          </Text>
        </View>
        {isSelected ? <Icon as={Check} size={18} className="text-primary" /> : null}
      </View>
    </Pressable>
  );
}

export function mapActivityPlanToResourcePickerItem(
  plan: ActivityPlanPickerSource,
): ResourcePickerItem {
  const metrics = getAuthoritativeActivityPlanMetrics(plan);
  const primaryCategory = plan.primary_category ?? plan.categories?.[0] ?? "other";
  return {
    activityCategory: primaryCategory,
    activityPlanCardData: {
      activityType: primaryCategory,
      createdAt: plan.created_at,
      description: plan.description,
      estimatedDuration: metrics.estimated_duration,
      estimatedTss: metrics.estimated_tss,
      hasLiked: plan.has_liked,
      id: plan.id,
      likesCount: plan.likes_count,
      name: plan.name,
      updatedAt: plan.updated_at,
    },
    createdAt: plan.created_at,
    description: plan.description,
    estimatedDuration: metrics.estimated_duration,
    estimatedTss: metrics.estimated_tss,
    id: plan.id,
    hasLiked: plan.has_liked,
    isPublic: plan.template_visibility === "public",
    isSystem: plan.is_system_template,
    likesCount: plan.likes_count,
    name: plan.name,
    presentation: "canonical",
    updatedAt: plan.updated_at,
  };
}

export function mapRouteToResourcePickerItem(route: RoutePickerSource): ResourcePickerItem {
  return {
    activityCategory: route.activity_category,
    description: route.description,
    id: route.id,
    isPublic: route.is_public,
    isSystem: route.is_system_template,
    name: route.name,
    presentation: "canonical",
    routeCardData: {
      activity_category: route.activity_category,
      description: route.description,
      has_liked: route.has_liked,
      id: route.id,
      likes_count: route.likes_count,
      name: route.name,
      total_ascent: route.total_ascent,
      total_descent: route.total_descent,
      total_distance: route.total_distance,
    },
    totalAscent: route.total_ascent,
    totalDistance: route.total_distance,
  };
}
