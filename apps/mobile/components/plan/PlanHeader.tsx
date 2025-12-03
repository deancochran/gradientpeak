import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { Calendar, Target, TrendingUp } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface PlanProgress {
  name: string;
  week: string;
  percentage: number;
}

interface PlanHeaderProps {
  adherenceRate: number;
  weeklyScheduled: number;
  planProgress: PlanProgress;
  onCalendarPress: () => void;
}

export function PlanHeader({
  adherenceRate,
  weeklyScheduled,
  planProgress,
  onCalendarPress,
}: PlanHeaderProps) {
  return (
    <View className="bg-primary px-5 pt-12 pb-6">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-2xl font-bold text-primary-foreground">Plan</Text>
        <TouchableOpacity
          onPress={onCalendarPress}
          className="p-2"
          activeOpacity={0.7}
        >
          <Icon as={Calendar} size={24} className="text-primary-foreground" />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-primary-foreground/10 rounded-xl p-3">
          <View className="flex-row items-center gap-1 mb-1">
            <Icon as={Target} size={16} className="text-primary-foreground" />
            <Text className="text-xs text-primary-foreground/90">
              Adherence
            </Text>
          </View>
          <Text className="text-2xl font-bold text-primary-foreground">
            {adherenceRate}%
          </Text>
        </View>

        <View className="flex-1 bg-primary-foreground/10 rounded-xl p-3">
          <View className="flex-row items-center gap-1 mb-1">
            <Icon
              as={TrendingUp}
              size={16}
              className="text-primary-foreground"
            />
            <Text className="text-xs text-primary-foreground/90">
              This Week
            </Text>
          </View>
          <Text className="text-2xl font-bold text-primary-foreground">
            {weeklyScheduled}
          </Text>
        </View>
      </View>

      {/* Plan Progress */}
      <Card className="bg-primary-foreground/10 border-primary-foreground/20">
        <CardHeader className="pb-3">
          <View className="flex-row items-center justify-between">
            <CardTitle className="text-primary-foreground text-base">
              {planProgress.name}
            </CardTitle>
            <Text className="text-primary-foreground text-sm font-medium">
              Week {planProgress.week}
            </Text>
          </View>
        </CardHeader>
        <CardContent className="pt-0">
          <Progress
            value={planProgress.percentage}
            className="w-full h-2 mb-2"
            indicatorClassName="bg-primary-foreground"
          />
          <Text className="text-primary-foreground/80 text-sm">
            {planProgress.percentage}% complete
          </Text>
        </CardContent>
      </Card>
    </View>
  );
}
