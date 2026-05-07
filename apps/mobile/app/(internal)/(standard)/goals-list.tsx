import { formatGoalTypeLabel, getGoalMetricSummary, getGoalObjectiveSummary } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Flag, Plus, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { ROUTES } from "@/lib/constants/routes";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

type GoalFilter = "active" | "upcoming" | "completed";

const FILTERS: Array<{ label: string; value: GoalFilter }> = [
  { label: "Active", value: "active" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Completed", value: "completed" },
];

function getDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function formatGoalDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function GoalsListScreen() {
  const navigateTo = useAppNavigate();
  const goals = useProfileGoals({ loadAllPages: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<GoalFilter>("active");
  const todayKey = getDateKey(new Date());
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredGoals = useMemo(() => {
    return goals.goals
      .filter((goal) => {
        if (filter === "completed") {
          return goal.target_date < todayKey;
        }

        return goal.target_date >= todayKey;
      })
      .filter((goal) => {
        if (!normalizedSearch) {
          return true;
        }

        return [goal.title, goal.activity_category, formatGoalTypeLabel(goal)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) =>
        filter === "completed"
          ? right.target_date.localeCompare(left.target_date)
          : left.target_date.localeCompare(right.target_date),
      );
  }, [filter, goals.goals, normalizedSearch, todayKey]);

  const handleRefresh = async () => {
    await goals.refetch();
  };

  const renderSkeletons = () => (
    <View className="gap-3" testID="goals-list-loading">
      {[0, 1, 2].map((item) => (
        <View key={item} className="h-24 rounded-3xl bg-muted/40" />
      ))}
    </View>
  );

  return (
    <View className="flex-1 bg-background" testID="goals-list-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={goals.isFetching} onRefresh={handleRefresh} />}
      >
        <View className="gap-4">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1 gap-1">
              <Text className="text-2xl font-semibold text-foreground">Goals</Text>
              <Text className="text-sm text-muted-foreground">
                Browse the outcomes your calendar and analytics are tracking.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create goal"
              activeOpacity={0.85}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary"
              onPress={() => navigateTo(ROUTES.GOALS.CREATE as any)}
              testID="goals-list-create-button"
            >
              <Icon as={Plus} size={18} className="text-primary-foreground" />
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
            <Icon as={Search} size={16} className="text-muted-foreground" />
            <Input
              className="flex-1 border-0 bg-transparent px-0"
              placeholder="Search goals"
              value={searchQuery}
              onChangeText={setSearchQuery}
              testID="goals-list-search-input"
            />
          </View>

          <View className="flex-row flex-wrap gap-2">
            {FILTERS.map((option) => {
              const active = option.value === filter;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  className={`rounded-full border px-3 py-2 ${
                    active ? "border-primary bg-primary" : "border-border bg-card"
                  }`}
                  onPress={() => setFilter(option.value)}
                  testID={`goals-list-filter-${option.value}`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      active ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {goals.isLoading ? renderSkeletons() : null}

        {goals.isError ? (
          <Card className="rounded-3xl border border-border bg-card" testID="goals-list-error">
            <CardContent className="items-center gap-3 p-5">
              <Text className="text-center text-base font-semibold text-foreground">
                Goals could not be loaded
              </Text>
              <Text className="text-center text-sm text-muted-foreground">
                Check your connection and try again.
              </Text>
              <Button onPress={handleRefresh} variant="outline">
                <Text>Retry</Text>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!goals.isLoading && !goals.isError && filteredGoals.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            className="items-center gap-3 rounded-3xl border border-dashed border-border bg-card p-6"
            onPress={() => navigateTo(ROUTES.GOALS.CREATE as any)}
            testID="goals-list-empty"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon as={Flag} size={20} className="text-muted-foreground" />
            </View>
            <Text className="text-center text-base font-semibold text-foreground">
              No matching goals
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              Create a goal or adjust your filters to find older targets.
            </Text>
          </TouchableOpacity>
        ) : null}

        {!goals.isLoading && !goals.isError && filteredGoals.length > 0 ? (
          <View className="gap-3" testID="goals-list-results">
            {filteredGoals.map((goal) => {
              const metricSummary = getGoalMetricSummary(goal);
              const objectiveSummary = getGoalObjectiveSummary(goal);
              return (
                <TouchableOpacity
                  key={goal.id}
                  activeOpacity={0.85}
                  onPress={() => navigateTo(ROUTES.GOALS.DETAIL(goal.id) as any)}
                  testID={`goals-list-row-${goal.id}`}
                >
                  <Card className="rounded-3xl border border-border bg-card">
                    <CardContent className="gap-3 p-4">
                      <View className="flex-row items-start gap-3">
                        <View className="h-10 w-10 items-center justify-center rounded-full border border-amber-500/70 bg-amber-500/10">
                          <Icon as={Flag} size={16} className="text-foreground" />
                        </View>
                        <View className="min-w-0 flex-1 gap-1">
                          <Text
                            className="text-base font-semibold text-foreground"
                            numberOfLines={1}
                          >
                            {goal.title}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {formatGoalTypeLabel(goal)} · {formatGoalDate(goal.target_date)}
                          </Text>
                        </View>
                      </View>
                      {objectiveSummary ? (
                        <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
                          {objectiveSummary}
                        </Text>
                      ) : null}
                      {metricSummary ? (
                        <View className="self-start rounded-full bg-muted/40 px-3 py-1.5">
                          <Text className="text-xs font-medium text-foreground">
                            {metricSummary.label}: {metricSummary.value}
                          </Text>
                        </View>
                      ) : null}
                    </CardContent>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
