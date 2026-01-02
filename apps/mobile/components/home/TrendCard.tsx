import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Activity, Flame, TrendingUp } from "lucide-react-native";
import { Dimensions, TouchableOpacity, View } from "react-native";
import { LineChart } from "react-native-chart-kit";

interface TrendCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  icon?: "fitness" | "consistency" | "trending";
  chartData?: number[];
  onPress?: () => void;
  variant?: "fitness" | "consistency" | "default";
}

export function TrendCard({
  title,
  value,
  subtitle,
  trend,
  icon = "trending",
  chartData,
  onPress,
  variant = "default",
}: TrendCardProps) {
  const screenWidth = Dimensions.get("window").width;
  const cardWidth = (screenWidth - 48) / 2; // Account for padding and gap

  // Icon selection
  const IconComponent =
    icon === "fitness" ? Activity :
    icon === "consistency" ? Flame :
    TrendingUp;

  // Color scheme based on variant
  const getColorScheme = () => {
    switch (variant) {
      case "fitness":
        return {
          bg: "bg-blue-500/10",
          text: "text-blue-600",
          icon: "text-blue-500",
          chart: "rgba(59, 130, 246, 1)",
        };
      case "consistency":
        return {
          bg: "bg-orange-500/10",
          text: "text-orange-600",
          icon: "text-orange-500",
          chart: "rgba(249, 115, 22, 1)",
        };
      default:
        return {
          bg: "bg-green-500/10",
          text: "text-green-600",
          icon: "text-green-500",
          chart: "rgba(34, 197, 94, 1)",
        };
    }
  };

  const colors = getColorScheme();

  // Trend indicator color
  const getTrendColor = () => {
    if (trend === "up") return "text-green-600";
    if (trend === "down") return "text-red-600";
    return "text-muted-foreground";
  };

  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper onPress={onPress} disabled={!onPress} className="flex-1">
      <Card className="bg-card border-border h-full">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <View className={`${colors.bg} p-2 rounded-full`}>
              <IconComponent className={colors.icon} size={16} />
            </View>
            {trend && (
              <View className="flex-row items-center gap-1">
                <TrendingUp
                  size={12}
                  className={getTrendColor()}
                  style={{
                    transform: [{
                      rotate: trend === "down" ? "180deg" : "0deg"
                    }]
                  }}
                />
              </View>
            )}
          </View>

          {/* Value */}
          <View>
            <Text className={`text-2xl font-bold ${colors.text}`}>
              {value}
            </Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {title}
            </Text>
          </View>

          {/* Subtitle or Chart */}
          {chartData && chartData.length > 0 ? (
            <View className="h-12 -mx-2 -mb-2">
              <LineChart
                data={{
                  labels: [],
                  datasets: [{ data: chartData }],
                }}
                width={cardWidth}
                height={48}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withVerticalLabels={false}
                withHorizontalLabels={false}
                chartConfig={{
                  backgroundColor: "transparent",
                  backgroundGradientFrom: "transparent",
                  backgroundGradientTo: "transparent",
                  decimalPlaces: 0,
                  color: () => colors.chart,
                  strokeWidth: 2,
                  propsForBackgroundLines: {
                    strokeWidth: 0,
                  },
                }}
                bezier
                style={{
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              />
            </View>
          ) : subtitle ? (
            <Text className="text-xs text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
        </CardContent>
      </Card>
    </CardWrapper>
  );
}
