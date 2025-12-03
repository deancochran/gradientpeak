import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface WeeklyGoal {
  actual: number;
  target: number;
  unit: string;
  percentage: number;
}

interface WeeklyGoalCardProps {
  weeklyGoal: WeeklyGoal;
}

export function WeeklyGoalCard({ weeklyGoal }: WeeklyGoalCardProps) {
  if (weeklyGoal.target === 0) {
    return null;
  }

  const getProgressColor = () => {
    if (weeklyGoal.percentage >= 100) return "bg-green-500";
    if (weeklyGoal.percentage >= 70) return "bg-blue-500";
    return "bg-orange-500";
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground">Weekly Goal</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="flex-row items-end justify-between mb-2">
          <View>
            <Text className="text-muted-foreground text-sm">Progress</Text>
            <Text className="text-foreground text-2xl font-bold">
              {weeklyGoal.actual} {weeklyGoal.unit}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-muted-foreground text-sm">Target</Text>
            <Text className="text-card-foreground text-xl font-semibold">
              {weeklyGoal.target} {weeklyGoal.unit}
            </Text>
          </View>
        </View>
        <Progress
          value={weeklyGoal.percentage}
          className="w-full h-3 mb-2"
          indicatorClassName={getProgressColor()}
        />
        <Text className="text-muted-foreground text-sm text-center">
          {weeklyGoal.percentage}% complete
        </Text>
      </CardContent>
    </Card>
  );
}
