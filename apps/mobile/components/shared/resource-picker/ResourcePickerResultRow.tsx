import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Check, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";
import { getActivityCategoryConfig } from "@/lib/constants/activities";
import { formatEstimatedDurationSeconds, formatEstimatedTss } from "@/lib/estimatedMetrics";
import type { ResourcePickerItem, ResourcePickerScope } from "./resourcePickerTypes";

function formatDistance(meters?: number | null) {
  if (!meters || meters <= 0) return null;
  return `${(meters / 1000).toFixed(1)} km`;
}

function getVisibilityLabel(item: ResourcePickerItem) {
  if (item.isSystem) return "System";
  if (item.isPublic) return "Public";
  return "Private or shared";
}

type ResourcePickerResultRowProps = {
  isSelected: boolean;
  item: ResourcePickerItem;
  onPress: () => void;
  scope: ResourcePickerScope;
};

export function ResourcePickerResultRow({
  isSelected,
  item,
  onPress,
  scope,
}: ResourcePickerResultRowProps) {
  const activityConfig = getActivityCategoryConfig(item.activityCategory || "other");
  const metadata =
    scope === "routes"
      ? [
          getVisibilityLabel(item),
          formatDistance(item.totalDistance),
          item.totalAscent ? `${item.totalAscent}m climb` : null,
        ]
      : [
          activityConfig.name,
          formatEstimatedDurationSeconds(item.estimatedDuration),
          formatEstimatedTss(item.estimatedTss),
        ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={`rounded-2xl border p-3 ${
        isSelected ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
      onPress={onPress}
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

export function mapActivityPlanToResourcePickerItem(plan: any): ResourcePickerItem {
  const metrics = getAuthoritativeActivityPlanMetrics(plan);
  return {
    activityCategory: plan.activity_category,
    description: plan.description,
    estimatedDuration: metrics.estimated_duration,
    estimatedTss: metrics.estimated_tss,
    id: plan.id,
    isPublic: plan.template_visibility === "public" || plan.is_public,
    isSystem: plan.is_system_template,
    name: plan.name,
  };
}

export function mapRouteToResourcePickerItem(route: any): ResourcePickerItem {
  return {
    activityCategory: route.activity_category,
    description: route.description,
    id: route.id,
    isPublic: route.is_public,
    isSystem: route.is_system_template,
    name: route.name,
    totalAscent: route.total_ascent,
    totalDistance: route.total_distance,
  };
}
