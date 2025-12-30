import { Text } from "@/components/ui/text";
import { LucideIcon } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface TrendCardProps {
  title: string;
  currentValue: string | number;
  changeValue?: string;
  changeDirection?: "up" | "down" | "neutral";
  icon?: LucideIcon;
  iconColor?: string;
  microChart?: React.ReactNode;
  onExpand: () => void;
  subtitle?: string;
}

export function TrendCard({
  title,
  currentValue,
  changeValue,
  changeDirection = "neutral",
  icon: Icon,
  iconColor = "text-blue-500",
  microChart,
  onExpand,
  subtitle,
}: TrendCardProps) {
  const getChangeColor = () => {
    switch (changeDirection) {
      case "up":
        return "text-green-600";
      case "down":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  const getDirectionIcon = () => {
    switch (changeDirection) {
      case "up":
        return "↗️";
      case "down":
        return "↘️";
      default:
        return "→";
    }
  };

  return (
    <TouchableOpacity
      onPress={onExpand}
      className="bg-card rounded-xl border border-border p-4 shadow-sm active:opacity-80"
      activeOpacity={0.9}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          {Icon && <Icon size={20} className={iconColor} />}
          <Text className="text-sm font-semibold text-foreground">{title}</Text>
        </View>
        {changeDirection !== "neutral" && (
          <Text className="text-lg">{getDirectionIcon()}</Text>
        )}
      </View>

      {/* Micro Chart or Visual */}
      {microChart && <View className="mb-3 h-16">{microChart}</View>}

      {/* Current Value */}
      <View className="mb-2">
        <Text className="text-3xl font-bold text-foreground">
          {currentValue}
        </Text>
        {subtitle && (
          <Text className="text-xs text-muted-foreground mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>

      {/* Change Value */}
      {changeValue && (
        <Text className={`text-sm font-medium ${getChangeColor()}`}>
          {changeValue}
        </Text>
      )}

      {/* Tap Affordance */}
      <View className="mt-3 pt-3 border-t border-border">
        <Text className="text-xs text-muted-foreground text-center">
          Tap for details →
        </Text>
      </View>
    </TouchableOpacity>
  );
}
