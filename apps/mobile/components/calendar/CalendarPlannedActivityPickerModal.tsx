import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ChevronRight, Clock3, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  estimated_duration?: number | null;
  estimated_tss?: number | null;
  description?: string | null;
};

interface CalendarPlannedActivityPickerModalProps {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
  onSelectPlan: (activityPlanId: string) => void;
}

function toDisplayDateLabel(selectedDate: string): string {
  return format(new Date(`${selectedDate}T12:00:00.000Z`), "EEEE, MMM d");
}

function toCategoryLabel(category?: string | null): string {
  if (!category) return "Activity";

  return category
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`
        : segment,
    )
    .join(" ");
}

function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function CalendarPlannedActivityPickerModal({
  visible,
  selectedDate,
  onClose,
  onSelectPlan,
}: CalendarPlannedActivityPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: activityPlansData,
    isLoading,
    error,
    refetch,
  } = trpc.activityPlans.list.useQuery(
    {
      ownerScope: "own",
      limit: 100,
    },
    {
      enabled: visible,
    },
  );

  const filteredPlans = useMemo(() => {
    const plans = (activityPlansData?.items ?? []) as ActivityPlanListItem[];
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return plans;
    }

    return plans.filter((plan) => {
      const haystacks = [plan.name, plan.description, plan.activity_category]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());

      return haystacks.some((value) => value.includes(normalizedQuery));
    });
  }, [activityPlansData?.items, searchQuery]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="border-b border-border px-4 py-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-foreground">
                Schedule Activity
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Stay on {toDisplayDateLabel(selectedDate)} and choose one of
                your saved activity plans.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="rounded-md bg-muted px-3 py-2"
              activeOpacity={0.8}
              testID="calendar-planned-activity-close"
            >
              <Text className="text-xs font-medium text-foreground">Close</Text>
            </TouchableOpacity>
          </View>

          <View className="mt-4 flex-row items-center rounded-lg border border-border bg-card px-3">
            <Icon as={Search} size={14} className="text-muted-foreground" />
            <Input
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search your activity plans"
              className="flex-1 border-0 bg-transparent"
              testID="calendar-planned-activity-search"
            />
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3 px-4 py-4"
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <View className="items-center gap-3 rounded-xl border border-border bg-card px-4 py-8">
              <ActivityIndicator />
              <Text className="text-sm text-muted-foreground">
                Loading your activity plans...
              </Text>
            </View>
          ) : null}

          {!isLoading && error ? (
            <View className="gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4">
              <Text className="text-sm font-medium text-destructive">
                Could not load your activity plans.
              </Text>
              <TouchableOpacity
                onPress={() => void refetch()}
                className="self-start rounded-md border border-border bg-background px-3 py-2"
                activeOpacity={0.8}
                testID="calendar-planned-activity-retry"
              >
                <Text className="text-xs font-medium text-foreground">
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!isLoading && !error && filteredPlans.length === 0 ? (
            <View className="gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-6">
              <Text className="text-sm font-medium text-foreground">
                {searchQuery.trim().length > 0
                  ? "No matching activity plans"
                  : "No saved activity plans yet"}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {searchQuery.trim().length > 0
                  ? "Try a different search term."
                  : "Create an activity plan first, then come back here to schedule it."}
              </Text>
            </View>
          ) : null}

          {!isLoading && !error
            ? filteredPlans.map((plan) => {
                const durationLabel = formatDuration(plan.estimated_duration);

                return (
                  <TouchableOpacity
                    key={plan.id}
                    onPress={() => onSelectPlan(plan.id)}
                    className="rounded-xl border border-border bg-card px-4 py-4"
                    activeOpacity={0.8}
                    testID={`calendar-planned-activity-option-${plan.id}`}
                  >
                    <View className="flex-row items-start gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="text-sm font-semibold text-foreground">
                          {plan.name}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {toCategoryLabel(plan.activity_category)}
                          {durationLabel ? ` • ${durationLabel}` : ""}
                          {typeof plan.estimated_tss === "number"
                            ? ` • ${Math.round(plan.estimated_tss)} TSS`
                            : ""}
                        </Text>
                        {plan.description ? (
                          <Text
                            className="text-xs text-muted-foreground"
                            numberOfLines={2}
                          >
                            {plan.description}
                          </Text>
                        ) : null}
                      </View>
                      <View className="flex-row items-center gap-1 pt-0.5">
                        <Icon
                          as={Clock3}
                          size={12}
                          className="text-muted-foreground"
                        />
                        <Icon
                          as={ChevronRight}
                          size={16}
                          className="text-muted-foreground"
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            : null}
        </ScrollView>

        <View className="px-4 pb-4 pt-2">
          <Text className="text-center text-xs text-muted-foreground">
            Choose a plan to continue into the scheduling form.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
