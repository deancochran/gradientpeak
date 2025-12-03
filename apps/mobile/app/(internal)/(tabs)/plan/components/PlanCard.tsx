import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  Activity,
  Bike,
  Clock,
  Dumbbell,
  Footprints,
  User,
  Waves,
} from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface PlanCardProps {
  plan: {
    id: string;
    name: string;
    description?: string;
    activity_category: string;
    estimated_duration?: number;
    estimated_tss?: number;
    created_by?: string;
    structure?: {
      steps: any[];
    };
  };
  onPress: (planId: string) => void;
  showOwnership?: boolean;
}

const ACTIVITY_CONFIGS = {
  outdoor_run: {
    name: "Outdoor Run",
    icon: Footprints,
    color: "text-blue-600",
  },
  outdoor_bike: { name: "Outdoor Bike", icon: Bike, color: "text-green-600" },
  indoor_treadmill: {
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    icon: Bike,
    color: "text-orange-600",
  },
  indoor_strength: {
    name: "Strength Training",
    icon: Dumbbell,
    color: "text-red-600",
  },
  indoor_swim: { name: "Swimming", icon: Waves, color: "text-cyan-600" },
  other: { name: "Other Activity", icon: Activity, color: "text-gray-600" },
};

export function PlanCard({
  plan,
  onPress,
  showOwnership = true,
}: PlanCardProps) {
  const config =
    ACTIVITY_CONFIGS[plan.activity_category as keyof typeof ACTIVITY_CONFIGS] ||
    ACTIVITY_CONFIGS.other;
  const isUserPlan = plan.created_by && showOwnership;

  return (
    <TouchableOpacity
      onPress={() => onPress(plan.id)}
      className="active:opacity-70"
    >
      <Card>
        <CardContent className="p-4">
          <View className="flex-row items-start">
            {/* Icon */}
            <View className="mr-3 mt-1">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                <Icon as={config.icon} size={24} className={config.color} />
              </View>
            </View>

            {/* Content */}
            <View className="flex-1">
              {/* Header */}
              <View className="flex-row items-start justify-between mb-1">
                <Text className="text-lg font-semibold flex-1 pr-2">
                  {plan.name}
                </Text>
                {isUserPlan && (
                  <View className="bg-primary/10 px-2 py-1 rounded-full flex-row items-center">
                    <Icon as={User} size={12} className="text-primary mr-1" />
                    <Text className="text-xs text-primary font-medium">
                      Your Plan
                    </Text>
                  </View>
                )}
              </View>

              {/* Activity Type */}
              <Text className="text-sm text-muted-foreground mb-2">
                {config.name}
              </Text>

              {/* Description */}
              {plan.description && (
                <Text
                  className="text-sm text-muted-foreground mb-2"
                  numberOfLines={2}
                >
                  {plan.description}
                </Text>
              )}

              {/* Metadata */}
              <View className="flex-row items-center gap-4">
                {plan.estimated_duration && (
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={14}
                      className="text-muted-foreground mr-1"
                    />
                    <Text className="text-xs text-muted-foreground">
                      {plan.estimated_duration} min
                    </Text>
                  </View>
                )}

                {plan.estimated_tss && (
                  <Text className="text-xs text-muted-foreground">
                    TSS: {plan.estimated_tss}
                  </Text>
                )}

                {plan.structure?.steps && (
                  <Text className="text-xs text-muted-foreground">
                    {plan.structure.steps.length} steps
                  </Text>
                )}
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
