import { View } from "react-native";

import { Card, CardContent } from "../card/index.native";
import { Icon } from "../icon/index.native";
import { Text } from "../text/index.native";
import type { MetricCardProps } from "./shared";

const variantColors = {
  default: "text-foreground",
  success: "text-green-600",
  warning: "text-yellow-600",
  danger: "text-red-600",
} as const;

function MetricCard({
  color,
  comparisonLabel,
  comparisonValue,
  icon,
  label,
  subtitle,
  unit,
  value,
  variant = "default",
}: MetricCardProps) {
  const valueClassName = color ?? variantColors[variant];

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        {(icon || label) && (
          <View className="mb-2 flex-row items-center gap-2">
            {icon ? (
              <Icon as={icon} className={color ?? "text-muted-foreground"} size={16} />
            ) : null}
            <Text className="text-xs uppercase text-muted-foreground">{label}</Text>
          </View>
        )}

        <View className="flex-row items-baseline gap-1">
          <Text className={`text-2xl font-bold ${valueClassName}`}>{value}</Text>
          {unit ? <Text className="text-sm text-muted-foreground">{unit}</Text> : null}
        </View>

        {subtitle ? <Text className="mt-1 text-xs text-muted-foreground">{subtitle}</Text> : null}

        {comparisonValue != null ? (
          <View className="mt-2 flex-row items-center gap-1">
            <Text className="text-xs text-muted-foreground">{comparisonLabel || "vs plan"}:</Text>
            <Text className="text-xs font-medium">{comparisonValue}</Text>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type { MetricCardProps } from "./shared";
export { MetricCard };
