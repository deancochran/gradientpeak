import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Plus,
} from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function TrainingPlansList() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get all training plans
  const {
    data: plans,
    isLoading,
    refetch,
  } = trpc.trainingPlans.list.useQuery();

  // Activate mutation
  const activateMutation = trpc.trainingPlans.activate.useMutation({
    onSuccess: () => {
      utils.trainingPlans.invalidate();
    },
  });

  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCreatePlan = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.WIZARD);
  };

  const handleViewPlan = (planId: string) => {
    router.push(`${ROUTES.PLAN.TRAINING_PLAN.INDEX}?id=${planId}`);
  };

  const handleActivatePlan = (planId: string) => {
    activateMutation.mutate({ id: planId });
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center px-4 py-4 bg-background border-b border-border">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Icon as={ArrowLeft} size={24} className="text-foreground" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">Training Plans</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">
            Loading training plans...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-4 bg-background border-b border-border">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Icon as={ArrowLeft} size={24} className="text-foreground" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">Training Plans</Text>
        </View>
        <Button
          variant="ghost"
          size="sm"
          onPress={handleCreatePlan}
          className="flex-row items-center gap-1"
        >
          <Icon as={Plus} size={20} className="text-primary" />
          <Text className="text-primary font-semibold">New</Text>
        </Button>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="p-4 gap-3">
          {/* Training Plans List */}
          {plans && plans.length > 0 ? (
            <>
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={plan.is_active ? "border-primary" : ""}
                >
                  <CardContent className="p-4">
                    <View className="flex-row items-start justify-between mb-3">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-2">
                          <View
                            className={`w-2 h-2 rounded-full ${
                              plan.is_active
                                ? "bg-green-500"
                                : "bg-muted-foreground"
                            }`}
                          />
                          <Text className="text-xs font-medium text-muted-foreground uppercase">
                            {plan.is_active ? "Active" : "Inactive"}
                          </Text>
                        </View>
                        <Text className="text-xl font-bold mb-1">
                          {plan.name}
                        </Text>
                        {plan.description && (
                          <Text className="text-sm text-muted-foreground">
                            {plan.description}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Plan Stats */}
                    <View className="flex-row gap-3 mb-3 pt-3 border-t border-border">
                      <View className="flex-1">
                        <Text className="text-xs text-muted-foreground mb-1">
                          Created
                        </Text>
                        <Text className="text-sm font-semibold">
                          {new Date(plan.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </Text>
                      </View>
                      {plan.structure && (
                        <>
                          {(plan.structure as any).plan_type === "periodized" &&
                            (plan.structure as any).blocks?.length > 0 && (
                              <View className="flex-1">
                                <Text className="text-xs text-muted-foreground mb-1">
                                  Blocks
                                </Text>
                                <Text className="text-sm font-semibold">
                                  {(plan.structure as any).blocks.length} phases
                                </Text>
                              </View>
                            )}
                          {(plan.structure as any).start_date && (
                            <View className="flex-1">
                              <Text className="text-xs text-muted-foreground mb-1">
                                Start Date
                              </Text>
                              <Text className="text-sm font-semibold">
                                {new Date(
                                  (plan.structure as any).start_date,
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>

                    {/* Action Buttons */}
                    <View className="flex-row gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onPress={() => handleViewPlan(plan.id)}
                      >
                        <Icon
                          as={ChevronRight}
                          size={16}
                          className="text-foreground mr-1"
                        />
                        <Text className="text-foreground text-sm">View</Text>
                      </Button>
                      {!plan.is_active && (
                        <Button
                          className="flex-1"
                          onPress={() => handleActivatePlan(plan.id)}
                          disabled={activateMutation.isPending}
                        >
                          <Icon
                            as={CheckCircle2}
                            size={16}
                            className="text-primary-foreground mr-1"
                          />
                          <Text className="text-primary-foreground font-semibold text-sm">
                            Set Active
                          </Text>
                        </Button>
                      )}
                    </View>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="p-8">
                <View className="items-center">
                  <View className="bg-muted rounded-full p-4 mb-4">
                    <Icon
                      as={Calendar}
                      size={40}
                      className="text-muted-foreground"
                    />
                  </View>
                  <Text className="text-lg font-semibold mb-2">
                    No Training Plans
                  </Text>
                  <Text className="text-sm text-muted-foreground text-center mb-6">
                    Create your first training plan to start tracking your
                    progress
                  </Text>
                  <Button
                    size="lg"
                    onPress={handleCreatePlan}
                    className="flex-row items-center gap-2"
                  >
                    <Icon
                      as={Plus}
                      size={20}
                      className="text-primary-foreground"
                    />
                    <Text className="text-primary-foreground font-semibold">
                      Create Training Plan
                    </Text>
                  </Button>
                </View>
              </CardContent>
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
