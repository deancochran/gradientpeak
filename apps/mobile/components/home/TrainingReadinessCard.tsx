import React from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, G } from "react-native-svg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TrainingReadinessCardProps {
  percentage: number;
  status: string;
  ctl: number;
  ctlStatus: string;
  atl: number;
  atlStatus: string;
  tsb: number;
  tsbStatus: string;
}

export function TrainingReadinessCard({
  percentage,
  status,
  ctl,
  ctlStatus,
  atl,
  atlStatus,
  tsb,
  tsbStatus,
}: TrainingReadinessCardProps) {
  const size = 200;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.61; // 220-degree arc

  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming((percentage / 100) * arcLength, {
      duration: 1500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [percentage, arcLength]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength - progress.value,
  }));

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "prime":
      case "fresh":
        return "text-green-500";
      case "good":
      case "steady":
        return "text-blue-500";
      case "moderate":
      case "neutral":
        return "text-purple-500";
      case "fatigued":
      case "tired":
        return "text-orange-500";
      case "low":
        return "text-slate-500";
      case "high":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusColorHex = (status: string) => {
    switch (status.toLowerCase()) {
      case "prime":
      case "fresh":
        return "#22c55e"; // green-500
      case "good":
      case "steady":
        return "#3b82f6"; // blue-500
      case "moderate":
      case "neutral":
        return "#a855f7"; // purple-500
      case "fatigued":
      case "tired":
        return "#f97316"; // orange-500
      case "low":
        return "#64748b"; // slate-500
      case "high":
        return "#ef4444"; // red-500
      default:
        return "#71717a"; // zinc-500
    }
  };

  // Calculate the starting position for a 220-degree arc
  // Starting at -110 degrees from top (12 o'clock position)
  const startAngle = -110;
  const rotation = startAngle;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground">Training Readiness</CardTitle>
      </CardHeader>
      <CardContent className="items-center">
        {/* Circular Gauge */}
        <View className="items-center justify-center mb-6">
          <Svg width={size} height={size} style={{ transform: [{ rotate: `${rotation}deg` }] }}>
            <G rotation={0} origin={`${size / 2}, ${size / 2}`}>
              {/* Background Arc */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="hsl(240 3.7% 15.9%)" // border color
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${arcLength} ${circumference}`}
                strokeLinecap="round"
              />
              {/* Animated Progress Arc */}
              <AnimatedCircle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={getStatusColorHex(status)}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${arcLength} ${circumference}`}
                animatedProps={animatedProps}
                strokeLinecap="round"
              />
            </G>
          </Svg>

          {/* Center Content */}
          <View
            style={{
              position: "absolute",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text className="text-5xl font-bold text-foreground mb-1">
              {percentage}%
            </Text>
            <Text className={`text-lg font-semibold ${getStatusColor(status)}`}>
              {status}
            </Text>
          </View>
        </View>

        {/* Bottom Metrics */}
        <View className="w-full flex-row justify-between pt-4 border-t border-border">
          <View className="items-center flex-1">
            <Text className="text-muted-foreground text-xs mb-1">Fitness</Text>
            <Text className="text-foreground font-bold text-lg">{ctl}</Text>
            <Text className={`text-xs font-medium ${getStatusColor(ctlStatus)}`}>
              {ctlStatus}
            </Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-muted-foreground text-xs mb-1">Fatigue</Text>
            <Text className="text-foreground font-bold text-lg">{atl}</Text>
            <Text className={`text-xs font-medium ${getStatusColor(atlStatus)}`}>
              {atlStatus}
            </Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-muted-foreground text-xs mb-1">Form</Text>
            <Text className="text-foreground font-bold text-lg">{tsb}</Text>
            <Text className={`text-xs font-medium ${getStatusColor(tsbStatus)}`}>
              {tsbStatus}
            </Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
