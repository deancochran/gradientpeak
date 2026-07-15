import { View } from "react-native";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../card/index.native";
import { Text } from "../text/index.native";
import type { ChartCardProps, ChartEmptyStateProps } from "./shared";
import { getChartAccessibilityLabel } from "./shared";

function ChartCard({
  children,
  className,
  description,
  legend,
  summary,
  testId,
  title,
}: ChartCardProps) {
  return (
    <Card className={className} testId={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {legend?.length ? (
          <View className="flex-row flex-wrap gap-3" accessibilityLabel="Chart legend">
            {legend.map((item) => (
              <View className="flex-row items-center gap-1" key={item.id}>
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <Text className="text-xs text-muted-foreground">{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </CardHeader>
      <CardContent className="gap-3">
        <Text className="sr-only" accessibilityLabel={getChartAccessibilityLabel(title, summary)}>
          {getChartAccessibilityLabel(title, summary)}
        </Text>
        {children}
        {summary?.length ? (
          <View className="flex-row flex-wrap gap-4">
            {summary.map((item) => (
              <View key={item.label}>
                <Text className="text-xs text-muted-foreground">{item.label}</Text>
                <Text className="text-sm font-semibold">{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartEmptyState({ message, testId }: ChartEmptyStateProps) {
  return (
    <View
      accessibilityLabel={message}
      className="min-h-56 items-center justify-center rounded-xl border border-dashed px-4"
      testID={testId}
    >
      <Text className="text-center text-sm text-muted-foreground">{message}</Text>
    </View>
  );
}

export type {
  ChartCardProps,
  ChartEmptyStateProps,
  ChartLegendItem,
  ChartSummaryItem,
} from "./shared";
export { ChartCard, ChartEmptyState, getChartAccessibilityLabel };
