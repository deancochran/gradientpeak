import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Activity, Calendar, TrendingUp } from "lucide-react-native";
import { RefreshControl, ScrollView, View } from "react-native";

interface TrainingPlanNoPlanEmptyStateProps {
  onCreatePlan: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function TrainingPlanNoPlanEmptyState({
  onCreatePlan,
  onRefresh,
  refreshing,
}: TrainingPlanNoPlanEmptyStateProps) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="flex-1 p-6 gap-6">
        <View className="mt-8 items-center rounded-2xl border border-border bg-card p-8">
          <View className="mb-6 rounded-full bg-primary/10 p-6">
            <Icon as={Activity} size={64} className="text-primary" />
          </View>
          <Text className="mb-3 text-center text-2xl font-bold">No Training Plan</Text>
          <Text className="mb-6 text-center text-base text-muted-foreground">
            A training plan organizes activities, weekly targets, and rest-day constraints in one
            schedule.
          </Text>
          <Button size="lg" onPress={onCreatePlan} className="w-full">
            <Text className="font-semibold text-primary-foreground">Create Training Plan</Text>
          </Button>
        </View>

        <View className="gap-4 mt-4">
          <Text className="text-lg font-semibold">Benefits of a Training Plan:</Text>
          <View className="flex-row items-start gap-3">
            <Icon as={TrendingUp} size={20} className="mt-1 text-primary" />
            <View className="flex-1">
              <Text className="font-semibold mb-1">Review Load History</Text>
              <Text className="text-sm text-muted-foreground">
                View CTL and ATL as load-history averages and TSB as the difference between them.
              </Text>
            </View>
          </View>
          <View className="flex-row items-start gap-3">
            <Icon as={Calendar} size={20} className="mt-1 text-primary" />
            <View className="flex-1">
              <Text className="font-semibold mb-1">Structured Scheduling</Text>
              <Text className="text-sm text-muted-foreground">
                Weekly TSS targets and constraint validation ensure balanced training.
              </Text>
            </View>
          </View>
          <View className="flex-row items-start gap-3">
            <Icon as={Activity} size={20} className="mt-1 text-primary" />
            <View className="flex-1">
              <Text className="font-semibold mb-1">Set Schedule Constraints</Text>
              <Text className="text-sm text-muted-foreground">
                Configure rest days, consecutive activity days, and activity distribution.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
