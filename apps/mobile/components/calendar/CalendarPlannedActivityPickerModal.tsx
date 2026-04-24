import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { ChevronRight, Clock3, Heart, Search, Sparkles } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";

type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  likes_count?: number | null;
  has_liked?: boolean | null;
};

type PlanSection = {
  key: string;
  title: string;
  subtitle: string;
  plans: ActivityPlanListItem[];
  accent: "default" | "suggested" | "favorites";
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
      segment.length > 0 ? `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}` : segment,
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

function toTimestamp(value?: string | null): number {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dedupePlans(plans: ActivityPlanListItem[]): ActivityPlanListItem[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    if (seen.has(plan.id)) {
      return false;
    }

    seen.add(plan.id);
    return true;
  });
}

function sortByRecency(plans: ActivityPlanListItem[]): ActivityPlanListItem[] {
  return [...plans].sort(
    (left, right) =>
      toTimestamp(right.updated_at ?? right.created_at) -
      toTimestamp(left.updated_at ?? left.created_at),
  );
}

function sortBySuggestionScore(plans: ActivityPlanListItem[]): ActivityPlanListItem[] {
  return [...plans].sort((left, right) => {
    const leftEstimatedTss = left.authoritative_metrics?.estimated_tss ?? 0;
    const leftEstimatedDuration = left.authoritative_metrics?.estimated_duration ?? 0;
    const rightEstimatedTss = right.authoritative_metrics?.estimated_tss ?? 0;
    const rightEstimatedDuration = right.authoritative_metrics?.estimated_duration ?? 0;
    const leftScore = leftEstimatedTss + leftEstimatedDuration / 600 + (left.description ? 10 : 0);
    const rightScore =
      rightEstimatedTss + rightEstimatedDuration / 600 + (right.description ? 10 : 0);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.name.localeCompare(right.name);
  });
}

function buildBrowseSections(plans: ActivityPlanListItem[]): PlanSection[] {
  const favoritePlans = dedupePlans(
    sortByRecency(plans.filter((plan) => plan.has_liked || (plan.likes_count ?? 0) > 0)).slice(
      0,
      4,
    ),
  );
  const favoriteIds = new Set(favoritePlans.map((plan) => plan.id));

  const recentPlans = dedupePlans(
    sortByRecency(plans.filter((plan) => !favoriteIds.has(plan.id))).slice(0, 4),
  );
  const recentIds = new Set(recentPlans.map((plan) => plan.id));

  const suggestedPlans = dedupePlans(
    sortBySuggestionScore(
      plans.filter((plan) => !favoriteIds.has(plan.id) && !recentIds.has(plan.id)),
    ).slice(0, 4),
  );
  const suggestedIds = new Set(suggestedPlans.map((plan) => plan.id));

  const allPlans = [...plans]
    .filter(
      (plan) => !favoriteIds.has(plan.id) && !recentIds.has(plan.id) && !suggestedIds.has(plan.id),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return [
    {
      key: "suggested",
      title: "Suggested",
      subtitle: "Best next picks with enough structure to schedule quickly.",
      plans: suggestedPlans,
      accent: "suggested" as const,
    },
    {
      key: "recent",
      title: "Recent",
      subtitle: "Plans you touched most recently.",
      plans: recentPlans,
      accent: "default" as const,
    },
    {
      key: "favorites",
      title: "Favorites",
      subtitle: "Saved standbys that are easy to reach again.",
      plans: favoritePlans,
      accent: "favorites" as const,
    },
    {
      key: "all",
      title: "All Plans",
      subtitle: "Everything that matches the current filter.",
      plans: allPlans,
      accent: "default" as const,
    },
  ].filter((section) => section.plans.length > 0);
}

export function CalendarPlannedActivityPickerModal({
  visible,
  selectedDate,
  onClose,
  onSelectPlan,
}: CalendarPlannedActivityPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const {
    data: activityPlansData,
    isLoading,
    error,
    refetch,
  } = api.activityPlans.list.useQuery(
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
    const categoryFilteredPlans =
      selectedCategory === "all"
        ? plans
        : plans.filter((plan) => plan.activity_category === selectedCategory);

    if (!normalizedQuery) {
      return categoryFilteredPlans;
    }

    return categoryFilteredPlans.filter((plan) => {
      const haystacks = [plan.name, plan.description, plan.activity_category]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());

      return haystacks.some((value) => value.includes(normalizedQuery));
    });
  }, [activityPlansData?.items, searchQuery, selectedCategory]);

  const categoryOptions = useMemo(() => {
    const plans = (activityPlansData?.items ?? []) as ActivityPlanListItem[];
    const categories = Array.from(
      new Set(plans.map((plan) => plan.activity_category).filter(Boolean)),
    ) as string[];

    return ["all", ...categories.sort()];
  }, [activityPlansData?.items]);

  const browseSections = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return [
        {
          key: "search-results",
          title: "Search Results",
          subtitle: `Matching plans for ${searchQuery.trim()}.`,
          plans: filteredPlans,
          accent: "default" as const,
        },
      ];
    }

    return buildBrowseSections(filteredPlans);
  }, [filteredPlans, searchQuery]);

  const renderPlanCard = (plan: ActivityPlanListItem, sectionKey: string) => {
    const estimatedDuration = plan.authoritative_metrics?.estimated_duration;
    const estimatedTss = plan.authoritative_metrics?.estimated_tss;
    const durationLabel = formatDuration(estimatedDuration);
    const categoryLabel = toCategoryLabel(plan.activity_category);
    const recommendationLabel =
      sectionKey === "suggested"
        ? "Good next pick"
        : sectionKey === "favorites"
          ? "Easy repeat"
          : null;

    return (
      <TouchableOpacity
        key={plan.id}
        onPress={() => onSelectPlan(plan.id)}
        className="rounded-xl border border-border bg-card px-4 py-4"
        activeOpacity={0.8}
        testID={`calendar-planned-activity-option-${plan.id}`}
      >
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-sm font-semibold text-foreground">{plan.name}</Text>
              {recommendationLabel ? (
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {recommendationLabel}
                </Text>
              ) : null}
            </View>

            <Text className="text-xs text-muted-foreground">
              {categoryLabel}
              {durationLabel ? ` • ${durationLabel}` : ""}
              {typeof estimatedTss === "number" ? ` • ${Math.round(estimatedTss)} TSS` : ""}
              {plan.has_liked || (plan.likes_count ?? 0) > 0
                ? ` • ${(plan.likes_count ?? 1) > 1 ? `${plan.likes_count} likes` : "Favorite"}`
                : ""}
            </Text>

            <Text className="text-xs text-muted-foreground" numberOfLines={2}>
              {plan.description ||
                `Saved ${categoryLabel.toLowerCase()} plan ready to drop onto this day.`}
            </Text>
          </View>

          <Icon as={ChevronRight} size={16} className="mt-0.5 text-muted-foreground" />
        </View>
      </TouchableOpacity>
    );
  };

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
              <Text className="text-lg font-semibold text-foreground">Schedule Activity</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Stay on {toDisplayDateLabel(selectedDate)} and choose one of your saved activity
                plans.
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="mt-4 gap-2"
          >
            {categoryOptions.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <TouchableOpacity
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  className={`rounded-full border px-3 py-2 ${
                    isSelected ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                  activeOpacity={0.8}
                  testID={`calendar-planned-activity-filter-${category}`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {category === "all" ? "All Sports" : toCategoryLabel(category)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3 px-4 py-4"
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <View className="items-center gap-3 rounded-xl border border-border bg-card px-4 py-8">
              <ActivityIndicator />
              <Text className="text-sm text-muted-foreground">Loading your activity plans...</Text>
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
                <Text className="text-xs font-medium text-foreground">Try again</Text>
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
            ? browseSections.map((section) => (
                <View
                  key={section.key}
                  className={`gap-3 rounded-2xl border px-4 py-4 ${
                    section.accent === "suggested"
                      ? "border-primary/20 bg-primary/5"
                      : section.accent === "favorites"
                        ? "border-border bg-muted/30"
                        : "border-border bg-background"
                  }`}
                  testID={`calendar-planned-activity-section-${section.key}`}
                >
                  <View className="flex-row items-start gap-3">
                    <View className="flex-1 gap-1">
                      <View className="flex-row items-center gap-2">
                        {section.key === "suggested" ? (
                          <Icon as={Sparkles} size={14} className="text-primary" />
                        ) : null}
                        {section.key === "favorites" ? (
                          <Icon as={Heart} size={14} className="text-muted-foreground" />
                        ) : null}
                        <Text className="text-sm font-semibold text-foreground">
                          {section.title}
                        </Text>
                      </View>
                      <Text className="text-xs text-muted-foreground">{section.subtitle}</Text>
                    </View>
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.plans.length} {section.plans.length === 1 ? "plan" : "plans"}
                    </Text>
                  </View>

                  {section.plans.map((plan) => renderPlanCard(plan, section.key))}
                </View>
              ))
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
