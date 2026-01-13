import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { type LucideIcon } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  comparisonValue?: string | number;
  comparisonLabel?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

export function MetricCard({
  icon,
  label,
  value,
  unit,
  comparisonValue,
  comparisonLabel,
  variant = "default",
}: MetricCardProps) {
  const variantColors = {
    default: "text-foreground",
    success: "text-green-600",
    warning: "text-yellow-600",
    danger: "text-red-600",
  };

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <View className="flex-row items-center gap-2 mb-2">
          <Icon as={icon} size={16} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground uppercase">
            {label}
          </Text>
        </View>

        <View className="flex-row items-baseline gap-1">
          <Text className={`text-2xl font-bold ${variantColors[variant]}`}>
            {value}
          </Text>
          {unit && (
            <Text className="text-sm text-muted-foreground">{unit}</Text>
          )}
        </View>

        {comparisonValue != null && (
          <View className="mt-2 flex-row items-center gap-1">
            <Text className="text-xs text-muted-foreground">
              {comparisonLabel || "vs plan"}:
            </Text>
            <Text className="text-xs font-medium">{comparisonValue}</Text>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
