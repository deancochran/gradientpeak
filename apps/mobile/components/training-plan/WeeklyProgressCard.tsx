import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { CheckCircle2, Target } from "lucide-react-native";
import { View } from "react-native";

interface WeeklyProgressCardProps {
  completedTSS: number;
  plannedTSS: number;
  targetTSS: number;
  completedActivities: number;
  totalPlannedActivities: number;
}

export function WeeklyProgressCard({
  completedTSS,
  plannedTSS,
  targetTSS,
  completedActivities,
  totalPlannedActivities,
}: WeeklyProgressCardProps) {
  // Calculate progress percentages
  const tssProgress = targetTSS > 0 ? (completedTSS / targetTSS) * 100 : 0;
  const activityProgress =
    totalPlannedActivities > 0
      ? (completedActivities / totalPlannedActivities) * 100
      : 0;

  // Determine progress bar color based on completion
  const getTSSProgressColor = () => {
    if (tssProgress >= 90) return "bg-green-500";
    if (tssProgress >= 70) return "bg-emerald-500";
    if (tssProgress >= 50) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getActivityProgressColor = () => {
    if (activityProgress >= 90) return "bg-green-500";
    if (activityProgress >= 70) return "bg-emerald-500";
    if (activityProgress >= 50) return "bg-yellow-500";
    return "bg-orange-500";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>This Week&apos;s Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="gap-6">
          {/* TSS Progress */}
          <View>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Icon as={Target} size={18} className="text-primary" />
                <Text className="font-semibold">Training Stress Score</Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {Math.round(tssProgress)}%
              </Text>
            </View>

            {/* TSS Progress Bar */}
            <View className="bg-muted rounded-full h-3 overflow-hidden mb-2">
              <View
                className={`${getTSSProgressColor()} h-full rounded-full`}
                style={{ width: `${Math.min(tssProgress, 100)}%` }}
              />
            </View>

            {/* TSS Numbers */}
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold">
                {Math.round(completedTSS)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                / {Math.round(targetTSS)} TSS target
              </Text>
            </View>

            {/* Planned vs Completed */}
            {plannedTSS > completedTSS && (
              <View className="mt-2 flex-row items-center gap-2">
                <View className="bg-blue-500/10 rounded px-2 py-1">
                  <Text className="text-xs text-blue-500 font-medium">
                    {Math.round(plannedTSS - completedTSS)} TSS remaining
                  </Text>
                </View>
              </View>
            )}
          </View>

          <View className="h-px bg-border" />

          {/* Activity Completion */}
          <View>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Icon as={CheckCircle2} size={18} className="text-primary" />
                <Text className="font-semibold">Activity Completion</Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {totalPlannedActivities > 0 ? Math.round(activityProgress) : 0}%
              </Text>
            </View>

            {/* Activity Progress Bar */}
            <View className="bg-muted rounded-full h-3 overflow-hidden mb-2">
              <View
                className={`${getActivityProgressColor()} h-full rounded-full`}
                style={{ width: `${Math.min(activityProgress, 100)}%` }}
              />
            </View>

            {/* Activity Count */}
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold">{completedActivities}</Text>
              <Text className="text-sm text-muted-foreground">
                / {totalPlannedActivities} activities
              </Text>
            </View>
          </View>

          {/* Status Messages */}
          {tssProgress >= 100 && (
            <View className="bg-green-500/10 rounded-lg p-3">
              <Text className="text-sm text-green-600 font-medium">
                🎉 Weekly TSS target achieved! Great work!
              </Text>
            </View>
          )}

          {tssProgress < 50 && totalPlannedActivities > completedActivities && (
            <View className="bg-orange-500/10 rounded-lg p-3">
              <Text className="text-sm text-orange-600 font-medium">
                ⚠️ Behind on weekly target. Consider completing scheduled
                activities.
              </Text>
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  );
}
