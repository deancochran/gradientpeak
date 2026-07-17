import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Heart, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";

type PlanSection = {
  key: string;
  title: string;
  subtitle: string;
  plans: ResourcePickerItem[];
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

function toTimestamp(value?: string | null): number {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dedupePlans(plans: ResourcePickerItem[]): ResourcePickerItem[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    if (seen.has(plan.id)) {
      return false;
    }

    seen.add(plan.id);
    return true;
  });
}

function sortByRecency(plans: ResourcePickerItem[]): ResourcePickerItem[] {
  return [...plans].sort(
    (left, right) =>
      toTimestamp(right.updatedAt ?? right.createdAt) -
      toTimestamp(left.updatedAt ?? left.createdAt),
  );
}

function sortBySuggestionScore(plans: ResourcePickerItem[]): ResourcePickerItem[] {
  return [...plans].sort((left, right) => {
    const leftEstimatedTss = left.estimatedTss ?? 0;
    const leftEstimatedDuration = left.estimatedDuration ?? 0;
    const rightEstimatedTss = right.estimatedTss ?? 0;
    const rightEstimatedDuration = right.estimatedDuration ?? 0;
    const leftScore = leftEstimatedTss + leftEstimatedDuration / 600 + (left.description ? 10 : 0);
    const rightScore =
      rightEstimatedTss + rightEstimatedDuration / 600 + (right.description ? 10 : 0);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.name.localeCompare(right.name);
  });
}

function buildBrowseSections(plans: ResourcePickerItem[]): PlanSection[] {
  const favoritePlans = dedupePlans(
    sortByRecency(plans.filter((plan) => plan.hasLiked || (plan.likesCount ?? 0) > 0)).slice(0, 4),
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

  const filterItems = (plans: ResourcePickerItem[]) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const categoryFilteredPlans =
      selectedCategory === "all"
        ? plans
        : plans.filter((plan) => plan.activityCategory === selectedCategory);

    if (!normalizedQuery) {
      return categoryFilteredPlans;
    }

    return categoryFilteredPlans.filter((plan) => {
      const haystacks = [plan.name, plan.description, plan.activityCategory]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());

      return haystacks.some((value) => value.includes(normalizedQuery));
    });
  };

  const renderPlanCard = (plan: ResourcePickerItem, sectionKey: string) => {
    const recommendationLabel =
      sectionKey === "suggested"
        ? "Good next pick"
        : sectionKey === "favorites"
          ? "Easy repeat"
          : null;

    return (
      <View key={plan.id} className="gap-1">
        {recommendationLabel ? (
          <Text className="self-start rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {recommendationLabel}
          </Text>
        ) : null}
        <ActivityPlanCard
          activityPlan={{
            ...plan,
            categories: plan.activityCategory ? [plan.activityCategory] : ["other"],
            primary_category: plan.activityCategory ?? "other",
            created_at: plan.createdAt ?? undefined,
            authoritative_metrics: {
              estimated_duration: plan.estimatedDuration,
              estimated_tss: plan.estimatedTss,
            },
            has_liked: plan.hasLiked ?? undefined,
            likes_count: plan.likesCount,
            updated_at: plan.updatedAt ?? undefined,
          }}
          onPress={() => onSelectPlan(plan.id)}
          testID={`calendar-planned-activity-option-${plan.id}`}
          variant="compact"
        />
      </View>
    );
  };

  return (
    <ResourcePickerModal
      activityPlanQueryOptions={{ limit: 100, ownerScope: "own" }}
      description={`Stay on ${toDisplayDateLabel(selectedDate)} and choose one of your saved activity plans.`}
      filterItems={filterItems}
      filterSlot={({ allItems }) => (
        <CategoryFilters
          categories={
            Array.from(
              new Set(allItems.map((plan) => plan.activityCategory).filter(Boolean)),
            ).sort() as string[]
          }
          onSelectCategory={setSelectedCategory}
          selectedCategory={selectedCategory}
        />
      )}
      footerSlot={
        <Text className="text-center text-xs text-muted-foreground">
          Choose a plan to continue into the scheduling form.
        </Text>
      }
      onClose={onClose}
      onSearchQueryChange={setSearchQuery}
      onSelect={(plan) => onSelectPlan(plan.id)}
      recommendationSlot={({ items }) => {
        const browseSections =
          searchQuery.trim().length > 0
            ? [
                {
                  key: "search-results",
                  title: "Search Results",
                  subtitle: `Matching plans for ${searchQuery.trim()}.`,
                  plans: items,
                  accent: "default" as const,
                },
              ]
            : buildBrowseSections(items);

        return (
          <View className="gap-3">
            {browseSections.map((section) => (
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
                      <Text className="text-sm font-semibold text-foreground">{section.title}</Text>
                    </View>
                    <Text className="text-xs text-muted-foreground">{section.subtitle}</Text>
                  </View>
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.plans.length} {section.plans.length === 1 ? "plan" : "plans"}
                  </Text>
                </View>
                {section.plans.map((plan) => renderPlanCard(plan, section.key))}
              </View>
            ))}
          </View>
        );
      }}
      scope="activityPlans"
      searchQuery={searchQuery}
      searchTestID="calendar-planned-activity-search"
      testID="calendar-planned-activity-modal"
      title="Schedule Activity"
      visible={visible}
    />
  );
}

function CategoryFilters({
  categories,
  onSelectCategory,
  selectedCategory,
}: {
  categories: string[];
  onSelectCategory: (category: string) => void;
  selectedCategory: string;
}) {
  const categoryOptions = ["all", ...categories];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {categoryOptions.map((category) => {
        const isSelected = selectedCategory === category;
        return (
          <TouchableOpacity
            key={category}
            activeOpacity={0.8}
            className={`rounded-full border px-3 py-2 ${
              isSelected ? "border-primary bg-primary/10" : "border-border bg-background"
            }`}
            onPress={() => onSelectCategory(category)}
            testID={`calendar-planned-activity-filter-${category}`}
          >
            <Text
              className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}
            >
              {category === "all" ? "All Sports" : toCategoryLabel(category)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
