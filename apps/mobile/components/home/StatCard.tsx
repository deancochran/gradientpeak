import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: IconComponent,
  trend,
  className,
}: StatCardProps) {
  const getTrendColor = () => {
    if (!trend) return "text-muted-foreground";
    // For fitness-related stats, up is usually good, down is bad
    // For fatigue, down is good, up is concerning
    if (title.toLowerCase().includes("fatigue")) {
      return trend.direction === "down" ? "text-green-500" : "text-orange-500";
    }
    return trend.direction === "up" ? "text-green-500" : "text-orange-500";
  };

  const getTrendIcon = () => {
    if (!trend) return null;
    return trend.direction === "up" ? "↑" : "↓";
  };

  return (
    <Card className={`flex-1 bg-card border-border ${className || ""}`}>
      <CardContent className="p-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-muted-foreground text-xs font-medium">
            {title}
          </Text>
          <Icon
            as={IconComponent}
            size={16}
            className="text-muted-foreground"
          />
        </View>
        <View className="flex-row items-end justify-between">
          <Text className="text-foreground text-xl font-bold">{value}</Text>
          {trend && (
            <View className="flex-row items-center">
              <Text className={`${getTrendColor()} text-sm font-semibold`}>
                {getTrendIcon()} {Math.abs(trend.value)}
              </Text>
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  );
}
