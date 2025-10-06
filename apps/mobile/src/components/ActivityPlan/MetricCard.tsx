import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import React, { memo } from "react";
import { View } from "react-native";

// ================================
// Activity Metrics Grid
// ================================

interface MetricCardProps {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}

const MetricCard = memo<MetricCardProps>(function MetricCard({
  icon: IconComponent,
  label,
  value,
  subtitle,
  color = "text-muted-foreground",
}: MetricCardProps) {
  return (
    <View className="bg-muted/30 rounded-lg p-3">
      <View className="flex-row items-center gap-2 mb-1">
        <Icon as={IconComponent} size={16} className={color} />
        <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </Text>
      </View>
      <Text className="text-lg font-semibold">{value}</Text>
      {subtitle && (
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      )}
    </View>
  );
});

MetricCard.displayName = "MetricCard";
