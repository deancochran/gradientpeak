import { Card, CardContent } from "@/components/ui/card";
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

export function StatCard({ title, value, icon: Icon, trend, className }: StatCardProps) {
  const getTrendColor = () => {
    if (!trend) return "text-slate-400";
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
    <Card className={`flex-1 bg-slate-800/50 border-slate-700 ${className || ""}`}>
      <CardContent className="p-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-slate-400 text-xs font-medium">{title}</Text>
          <Icon size={16} color="#94a3b8" />
        </View>
        <View className="flex-row items-end justify-between">
          <Text className="text-white text-xl font-bold">{value}</Text>
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
