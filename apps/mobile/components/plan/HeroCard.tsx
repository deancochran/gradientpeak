import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Play,
  CheckCircle2,
  Clock,
  Zap,
  MapPin,
  Users,
} from "lucide-react-native";
import { format } from "date-fns";
import { getActivityBgClass } from "@/app/(internal)/(tabs)/plan/utils/colors";

interface BaseActivity {
  id: string;
  scheduled_date: string;
  activity_plan?: {
    name: string;
    activity_category?: string;
    estimated_duration?: number;
    estimated_tss?: number;
    structure?: any;
  };
  completed_activity_id?: string | null;
}

interface HeroCardProps {
  activity: BaseActivity;
  onPress: () => void;
  onStartActivity: () => void;
  isCompleted: boolean;
  isPrimary?: boolean;
}

export function HeroCard({
  activity,
  onPress,
  onStartActivity,
  isCompleted,
  isPrimary = true,
}: HeroCardProps) {
  const activityType = activity.activity_plan?.activity_category || "other";
  const bgClass = getActivityBgClass(activityType);

  // Check if activity has intervals/structure
  const hasStructure =
    activity.activity_plan?.structure &&
    typeof activity.activity_plan.structure === "object" &&
    (activity.activity_plan.structure as any).steps?.length > 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      disabled={isCompleted}
    >
      <Card className={isPrimary ? "border-2" : ""}>
        <CardContent className="p-5">
          {/* Activity Type Badge */}
          <View className="flex-row items-center justify-between mb-4">
            <View className={`${bgClass} px-3 py-1.5 rounded-full`}>
              <Text className="text-white text-xs font-semibold uppercase tracking-wide">
                {activity.activity_plan?.activity_category?.replace(
                  /_/g,
                  " ",
                ) || "Activity"}
              </Text>
            </View>
            {isCompleted && (
              <View className="flex-row items-center gap-1.5">
                <Icon as={CheckCircle2} size={16} className="text-green-600" />
                <Text className="text-green-600 text-xs font-semibold">
                  Completed
                </Text>
              </View>
            )}
          </View>

          {/* Activity Name */}
          <Text className="text-xl font-bold mb-3">
            {activity.activity_plan?.name || "Unnamed Activity"}
          </Text>

          {/* Activity Metrics */}
          <View className="flex-row gap-4 mb-4">
            {activity.activity_plan?.estimated_duration && (
              <View className="flex-row items-center gap-1.5">
                <Icon as={Clock} size={16} className="text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">
                  {activity.activity_plan.estimated_duration} min
                </Text>
              </View>
            )}
            {activity.activity_plan?.estimated_tss && (
              <View className="flex-row items-center gap-1.5">
                <Icon as={Zap} size={16} className="text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">
                  {activity.activity_plan.estimated_tss} TSS
                </Text>
              </View>
            )}
          </View>

          {/* Structure Preview (if exists) */}
          {hasStructure && !isCompleted && activity.activity_plan && (
            <View className="bg-muted/50 rounded-lg p-3 mb-4">
              <Text className="text-xs text-muted-foreground font-semibold mb-2">
                STRUCTURE
              </Text>
              <Text className="text-sm" numberOfLines={2}>
                {((activity.activity_plan.structure as any).steps as any[])
                  .slice(0, 3)
                  .map(
                    (step: any, idx: number) => step.name || `Step ${idx + 1}`,
                  )
                  .join(" → ")}
                {((activity.activity_plan.structure as any).steps as any[])
                  .length > 3 && "..."}
              </Text>
            </View>
          )}

          {/* Primary Action Button */}
          {!isCompleted && isPrimary && (
            <Button onPress={onStartActivity} size="lg" className="w-full">
              <Icon
                as={Play}
                size={20}
                className="text-primary-foreground mr-2"
              />
              <Text className="text-primary-foreground font-semibold">
                Start Activity
              </Text>
            </Button>
          )}

          {/* View Details for non-primary */}
          {!isPrimary && (
            <TouchableOpacity onPress={onPress}>
              <Text className="text-primary text-sm font-medium text-center">
                View Details →
              </Text>
            </TouchableOpacity>
          )}
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}

// Stacked variant for multiple activities
interface StackedHeroCardsProps {
  activities: BaseActivity[];
  onActivityPress: (id: string) => void;
  onStartActivity: (activity: BaseActivity) => void;
  isActivityCompleted: (activity: BaseActivity) => boolean;
}

export function StackedHeroCards({
  activities,
  onActivityPress,
  onStartActivity,
  isActivityCompleted,
}: StackedHeroCardsProps) {
  if (activities.length === 0) return null;

  const primaryActivity = activities[0];
  const secondaryActivities = activities.slice(1);

  return (
    <View className="gap-3">
      {/* Primary Card */}
      <HeroCard
        activity={primaryActivity}
        onPress={() => onActivityPress(primaryActivity.id)}
        onStartActivity={() => onStartActivity(primaryActivity)}
        isCompleted={isActivityCompleted(primaryActivity)}
        isPrimary={true}
      />

      {/* Secondary Cards */}
      {secondaryActivities.map((activity) => (
        <HeroCard
          key={activity.id}
          activity={activity}
          onPress={() => onActivityPress(activity.id)}
          onStartActivity={() => onStartActivity(activity)}
          isCompleted={isActivityCompleted(activity)}
          isPrimary={false}
        />
      ))}
    </View>
  );
}
