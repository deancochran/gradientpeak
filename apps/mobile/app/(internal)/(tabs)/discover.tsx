import { AppHeader } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Dumbbell,
  Filter,
  Footprints,
  Loader2,
  Waves,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
// Wait, the previous file had FilterModal inline. I should probably keep it inline or define it in this file if it wasn't imported.
// The previous file had `function FilterModal(...)` at the bottom. I will preserve that.

// Complete category configurations matching database schema
const CATEGORIES = [
  {
    id: "run",
    name: "Running",
    icon: Footprints,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    subcategories: [
      { category: "run", location: "outdoor", label: "Outdoor Running" },
      { category: "run", location: "indoor", label: "Treadmill" },
    ],
  },
  {
    id: "bike",
    name: "Cycling",
    icon: Bike,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    subcategories: [
      { category: "bike", location: "outdoor", label: "Outdoor Cycling" },
      { category: "bike", location: "indoor", label: "Indoor Cycling" },
    ],
  },
  {
    id: "swim",
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    subcategories: [
      { category: "swim", location: "indoor", label: "Swimming" },
    ],
  },
  {
    id: "strength",
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-50",
    subcategories: [
      { category: "strength", location: "indoor", label: "Strength Training" },
    ],
  },
  {
    id: "other",
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    subcategories: [
      { category: "other", location: "outdoor", label: "Other Activities" },
    ],
  },
] as const;

export default function DiscoverPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Fetch activity plans (templates) from tRPC
  const { data: activityPlansData, isLoading } =
    trpc.activityPlans.list.useQuery({
      includeSystemTemplates: true,
      includeOwnOnly: false,
      limit: 100, // Fetch enough to cover standard templates
    });

  const activityPlans = activityPlansData?.items || [];

  // Determine if we're in search/filter mode
  const isFilterMode =
    searchQuery.trim() !== "" || selectedCategories.length > 0;

  // Get filtered activities
  const filteredActivities = useMemo(() => {
    let activities = activityPlans;

    // Filter by selected categories
    if (selectedCategories.length > 0) {
      activities = activities.filter((activity) => {
        return selectedCategories.includes(activity.activity_category || "");
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      activities = activities.filter(
        (activity) =>
          activity.name.toLowerCase().includes(query) ||
          (activity.description &&
            activity.description.toLowerCase().includes(query)),
      );
    }

    return activities;
  }, [activityPlans, searchQuery, selectedCategories]);

  const handleTemplatePress = (template: any) => {
    router.push({
      pathname: "/(internal)/(standard)/activity-plan-detail",
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    });
  };

  const handleViewAll = (categoryId: string) => {
    setSearchQuery("");
    setSelectedCategories([categoryId]);
    // The view will automatically switch to filtered mode
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Discover" />

      {/* Header with Search and Filters */}
      <View className="px-4 pt-4 pb-4 border-b border-border bg-background">
        <View className="flex-row gap-2">
          {/* Search Input */}
          <View className="flex-1">
            <Input
              placeholder="Search activities..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="h-12"
            />
          </View>

          {/* Filter Button */}
          <Button
            variant="outline"
            size="icon"
            onPress={() => setFilterModalVisible(true)}
            className="h-12 w-12"
          >
            <Icon as={Filter} size={20} />
          </Button>
        </View>

        {/* Active Filters Display */}
        {isFilterMode && (
          <View className="flex-row items-center gap-2 mt-2 flex-wrap">
            {selectedCategories.map((catId) => {
              const category = CATEGORIES.find((c) => c.id === catId);
              if (!category) return null;

              return (
                <View
                  key={catId}
                  className="flex-row items-center gap-1 bg-primary/10 px-2 py-1 rounded-full"
                >
                  <Text className="text-xs text-primary">{category.name}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      setSelectedCategories(
                        selectedCategories.filter((id) => id !== catId),
                      )
                    }
                  >
                    <Icon as={X} size={14} className="text-primary" />
                  </TouchableOpacity>
                </View>
              );
            })}

            {(searchQuery || selectedCategories.length > 0) && (
              <TouchableOpacity onPress={handleClearFilters}>
                <Text className="text-xs text-muted-foreground underline">
                  Clear all
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Content Area */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Icon as={Loader2} size={32} className="text-primary animate-spin" />
        </View>
      ) : (
        <View className="flex-1">
          {isFilterMode ? (
            // Filtered List View (Vertical)
            <FlatList
              data={filteredActivities}
              contentContainerStyle={{ padding: 16, gap: 16 }}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={
                <Text className="text-sm text-muted-foreground mb-2">
                  {filteredActivities.length} result
                  {filteredActivities.length !== 1 ? "s" : ""}
                </Text>
              }
              renderItem={({ item }) => (
                <ActivityPlanCard
                  activityPlan={item as any}
                  onPress={() => handleTemplatePress(item)}
                  variant="default"
                />
              )}
              ListEmptyComponent={
                <View className="items-center justify-center py-12">
                  <Text className="text-muted-foreground text-center">
                    No activities found matching your criteria
                  </Text>
                </View>
              }
            />
          ) : (
            // Default Categorized Rows View
            <ScrollView className="flex-1 py-4">
              {CATEGORIES.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  activities={activityPlans.filter(
                    (p) => p.activity_category === category.id,
                  )}
                  onViewAll={() => handleViewAll(category.id)}
                  onTemplatePress={handleTemplatePress}
                />
              ))}
              <View className="h-8" />
            </ScrollView>
          )}
        </View>
      )}

      {/* Filter Modal */}
      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        selectedCategories={selectedCategories}
        onCategoriesChange={setSelectedCategories}
      />
    </View>
  );
}

// Category Row Component
interface CategoryRowProps {
  category: (typeof CATEGORIES)[number];
  activities: any[];
  onViewAll: () => void;
  onTemplatePress: (template: any) => void;
}

function CategoryRow({
  category,
  activities,
  onViewAll,
  onTemplatePress,
}: CategoryRowProps) {
  if (activities.length === 0) return null;

  return (
    <View className="mb-6">
      {/* Category Header */}
      <View className="flex-row items-center justify-between px-4 mb-3">
        <View className="flex-row items-center gap-2">
          <Icon as={category.icon} size={20} className={category.color} />
          <Text className="text-xl font-semibold">{category.name}</Text>
        </View>

        <TouchableOpacity onPress={onViewAll}>
          <Text className="text-sm text-primary font-medium">View All</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Scrollable List */}
      <FlatList
        horizontal
        data={activities.slice(0, 5)} // Show first 5
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ width: 280 }}>
            <ActivityPlanCard
              activityPlan={item}
              onPress={() => onTemplatePress(item)}
              variant="default"
            />
          </View>
        )}
      />
    </View>
  );
}

// Filter Modal Component
interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
}

function FilterModal({
  visible,
  onClose,
  selectedCategories,
  onCategoriesChange,
}: FilterModalProps) {
  const toggleCategory = (categoryId: string) => {
    if (selectedCategories.includes(categoryId)) {
      onCategoriesChange(selectedCategories.filter((id) => id !== categoryId));
    } else {
      onCategoriesChange([...selectedCategories, categoryId]);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Modal Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-border">
          <Text className="text-lg font-semibold">Filter Activities</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon as={X} size={24} className="text-foreground" />
          </TouchableOpacity>
        </View>

        {/* Filter Content */}
        <ScrollView className="flex-1 p-4">
          <Text className="text-sm font-medium text-muted-foreground mb-3 uppercase">
            Categories
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map((category) => {
              const isSelected = selectedCategories.includes(category.id);
              return (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => toggleCategory(category.id)}
                  className={`flex-row items-center gap-2 px-4 py-3 rounded-xl border ${
                    isSelected
                      ? "bg-primary border-primary"
                      : "bg-card border-border"
                  }`}
                >
                  <Icon
                    as={category.icon}
                    size={20}
                    className={
                      isSelected ? "text-primary-foreground" : category.color
                    }
                  />
                  <Text
                    className={
                      isSelected ? "text-primary-foreground font-medium" : ""
                    }
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Modal Footer */}
        <View className="p-4 border-t border-border bg-background safe-area-bottom">
          <View className="flex-row gap-4">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => {
                onCategoriesChange([]);
                onClose();
              }}
            >
              <Text>Reset</Text>
            </Button>
            <Button className="flex-1" onPress={onClose}>
              <Text>Apply Filters</Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
