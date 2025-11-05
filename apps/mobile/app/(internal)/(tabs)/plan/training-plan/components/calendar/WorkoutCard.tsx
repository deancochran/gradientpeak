import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    X,
} from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface WorkoutCardProps {
  id: string;
  name: string;
  activityType: string;
  duration: number;
  tss: number;
  status: "completed" | "scheduled" | "warning" | "violation";
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
}

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    iconColor: "text-green-500",
    borderColor: "border-green-500",
    bgColor: "bg-green-500/5",
  },
  scheduled: {
    icon: Clock,
    iconColor: "text-blue-500",
    borderColor: "border-blue-500",
    bgColor: "bg-blue-500/5",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-orange-500",
    borderColor: "border-orange-500",
    bgColor: "bg-orange-500/5",
  },
  violation: {
    icon: X,
    iconColor: "text-red-500",
    borderColor: "border-red-500",
    bgColor: "bg-red-500/5",
  },
};

/**
 * Workout card component for displaying a workout in the calendar
 * Shows workout details with status indicator
 */
export function WorkoutCard({
  id,
  name,
  activityType,
  duration,
  tss,
  status,
  onPress,
  onLongPress,
}: WorkoutCardProps) {
  const statusInfo = statusConfig[status];

  const formatActivityType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      onLongPress={() => onLongPress?.(id)}
      activeOpacity={0.7}
      delayLongPress={500}
    >
      <View
        className={`${statusInfo.bgColor} ${statusInfo.borderColor} border-l-4 rounded-lg p-3 mb-2`}
      >
        {/* Status Icon and Name */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-2">
            <Text className="font-semibold text-sm leading-5" numberOfLines={2}>
              {name}
            </Text>
          </View>
          <Icon as={statusInfo.icon} size={18} className={statusInfo.iconColor} />
        </View>

        {/* Activity Type */}
        <Text className="text-xs text-muted-foreground capitalize mb-2">
          {formatActivityType(activityType)}
        </Text>

        {/* Metrics */}
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Icon as={Clock} size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">
              {duration} min
            </Text>
          </View>

          <Text className="text-xs text-muted-foreground">•</Text>

          <Text className="text-xs text-muted-foreground">
            {Math.round(tss)} TSS
          </Text>
        </View>

        {/* Status Messages */}
        {status === "warning" && (
          <View className="mt-2 pt-2 border-t border-orange-500/20">
            <Text className="text-xs text-orange-600">
              ⚠️ Constraint warning
            </Text>
          </View>
        )}

        {status === "violation" && (
          <View className="mt-2 pt-2 border-t border-red-500/20">
            <Text className="text-xs text-red-600">
              ❌ Constraint violation
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
