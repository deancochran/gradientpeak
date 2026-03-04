import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Activity } from "lucide-react-native";

interface RecommendedActivitySectionProps {
  currentCtl: number;
  currentAtl: number;
  targetType?: string; // from goal
  onSelectPlan?: (planId: string) => void;
}

export function RecommendedActivitySection({
  currentCtl,
  currentAtl,
  targetType,
  onSelectPlan,
}: RecommendedActivitySectionProps) {
  // Map unmet gap type to target zones
  const targetZones = React.useMemo(() => {
    switch (targetType) {
      case "power_threshold":
      case "pace_threshold":
        return ["Z4"];
      case "hr_threshold":
        return ["Z3", "Z4"];
      case "race_performance":
      default:
        return ["Z2", "Z3"];
    }
  }, [targetType]);

  const targetTss = currentCtl > 0 ? currentCtl : 50;

  const { data: recommendations, isLoading } =
    trpc.activityPlans.recommendDailyActivity.useQuery(
      {
        targetTss,
        targetZones,
        effortCategory: "moderate",
        currentCtl,
        currentAtl,
      },
      {
        staleTime: 1000 * 60 * 5, // 5 minutes
      },
    );

  const getRationaleExplanation = (code: string) => {
    switch (code) {
      case "TSS_MATCH_EXCELLENT":
        return "Perfect TSS match";
      case "TSS_MATCH_GOOD":
        return "Good TSS match";
      case "ZONE_MATCH_FULL":
        return "Targets your gap";
      case "ZONE_MATCH_PARTIAL":
        return "Partially targets gap";
      case "REJECTED_ACWR_UNSAFE":
        return "Too intense for today";
      case "REJECTED_EFFORT_MISMATCH":
        return "Effort doesn't match";
      default:
        return code.replace(/_/g, " ");
    }
  };

  if (isLoading) {
    return (
      <View className="gap-2">
        <Text className="text-sm font-medium text-muted-foreground px-1">
          Recommended for Today
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pl-1"
        >
          <Skeleton className="h-32 w-64 mr-3 bg-muted rounded-xl" />
          <Skeleton className="h-32 w-64 mr-3 bg-muted rounded-xl" />
        </ScrollView>
      </View>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  // Take top 3
  const topRecommendations = recommendations.slice(0, 3);

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-muted-foreground px-1">
        Recommended for Today
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="pl-1 pr-4"
      >
        {topRecommendations.map((rec) => (
          <Pressable
            key={rec.plan.id}
            onPress={() => onSelectPlan?.(rec.plan.id)}
          >
            <Card className="w-64 mr-3 p-4 bg-card border-border gap-3">
              <View className="flex-row justify-between items-start">
                <Text
                  className="font-semibold text-base flex-1 mr-2"
                  numberOfLines={1}
                >
                  {rec.plan.name}
                </Text>
                <Badge variant="secondary" className="bg-primary/10">
                  <Text className="text-primary font-medium">
                    {Math.round(rec.score)}/100
                  </Text>
                </Badge>
              </View>

              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-1">
                  <Activity size={14} className="text-muted-foreground" />
                  <Text className="text-sm text-muted-foreground">
                    {rec.plan.tss} TSS
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <CalendarDays size={14} className="text-muted-foreground" />
                  <Text className="text-sm text-muted-foreground">
                    {rec.plan.zones.join(", ")}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap gap-1 mt-1">
                {rec.matchRationale.map((reason: string, i: number) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="border-muted bg-muted/20"
                  >
                    <Text className="text-xs text-muted-foreground">
                      {getRationaleExplanation(reason)}
                    </Text>
                  </Badge>
                ))}
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
