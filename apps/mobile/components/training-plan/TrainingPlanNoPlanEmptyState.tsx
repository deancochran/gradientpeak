import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Activity, Calendar, TrendingUp } from "lucide-react-native";
import React from "react";
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
        <Card className="mt-8">
          <CardContent className="p-8">
            <View className="items-center">
              <View className="bg-primary/10 rounded-full p-6 mb-6">
                <Icon as={Activity} size={64} className="text-primary" />
              </View>
              <Text className="text-2xl font-bold mb-3 text-center">No Training Plan</Text>
              <Text className="text-base text-muted-foreground text-center mb-6">
                A training plan helps you build fitness systematically, track your progress, and
                prevent overtraining through structured activities and recovery.
              </Text>
              <View className="w-full gap-3">
                <Button size="lg" onPress={onCreatePlan}>
                  <Text className="text-primary-foreground font-semibold">
                    Create Training Plan
                  </Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>

        <View className="gap-4 mt-4">
          <Text className="text-lg font-semibold">Benefits of a Training Plan:</Text>
          <View className="flex-row items-start gap-3">
            <View className="bg-primary/10 rounded-full p-2 mt-1">
              <Icon as={TrendingUp} size={20} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold mb-1">Track Your Fitness</Text>
              <Text className="text-sm text-muted-foreground">
                Monitor CTL, ATL, and TSB to understand your fitness trends and form.
              </Text>
            </View>
          </View>
          <View className="flex-row items-start gap-3">
            <View className="bg-primary/10 rounded-full p-2 mt-1">
              <Icon as={Calendar} size={20} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold mb-1">Structured Scheduling</Text>
              <Text className="text-sm text-muted-foreground">
                Weekly TSS targets and constraint validation ensure balanced training.
              </Text>
            </View>
          </View>
          <View className="flex-row items-start gap-3">
            <View className="bg-primary/10 rounded-full p-2 mt-1">
              <Icon as={Activity} size={20} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold mb-1">Prevent Overtraining</Text>
              <Text className="text-sm text-muted-foreground">
                Recovery rules and intensity distribution keep you healthy and improving.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
