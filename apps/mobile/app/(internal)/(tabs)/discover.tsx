import { PlannedActivitiesList } from "@/components/PlannedActivitiesList";
import { QuickStartList } from "@/components/QuickStartList";
import { AppHeader } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import {
  buildEstimationContext,
  estimateActivity,
  getSampleActivitiesByCategory,
  SAMPLE_ACTIVITIES,
} from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Clock,
  Dumbbell,
  Filter,
  Footprints,
  Waves,
  X,
  Zap,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

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

// Transform template to activity_plan format (for consistency with database schema)
function transformTemplateToActivityPlan(template: any, profile: any): any {
  // Calculate estimates
  let estimates = null;
  try {
    const context = buildEstimationContext({
      userProfile: profile || {},
      activityPlan: template,
    });
    estimates = estimateActivity(context);
  } catch (error) {
    // Use template defaults
  }

  const durationMinutes = estimates
    ? Math.round(estimates.duration / 60)
    : template.estimated_duration;
  const tss = estimates ? Math.round(estimates.tss) : template.estimated_tss;

  // Return in activity_plan database schema format
  return {
    id:
      template.id ||
      `${template.activity_category}-${template.activity_location}`,
    name: template.name,
    activity_category: template.activity_category,
    activity_location: template.activity_location,
    description: template.description,
    structure: template.structure,
    estimated_duration: durationMinutes,
    estimated_tss: tss,
    route_id: template.structure?.route_id,
    notes: template.description,
  };
}

export default function DiscoverPage() {
  const router = useRouter();
  const { profile } = useRequireAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState("templates");

  // Determine if we're in search/filter mode
  const isFilterMode =
    searchQuery.trim() !== "" || selectedCategories.length > 0;

  // Get filtered activities
  const filteredActivities = useMemo(() => {
    let activities = SAMPLE_ACTIVITIES;

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
  }, [searchQuery, selectedCategories]);

  // Handle template selection - navigate to detail page
  const handleTemplatePress = (template: any) => {
    router.push({
      pathname: "/activity-plan-detail" as any,
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    });
  };

  // Handle "View All" for a category
  const handleViewAll = (categoryId: string) => {
    setSelectedCategories([categoryId]);
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
  };

  // Handle quick start selection
  const handleQuickStart = (category: any, location: any) => {
    const payload = {
      category,
      location,
    };
    activitySelectionStore.setSelection(payload);
    router.push("/record");
  };

  // Handle template selection
  const handleTemplateSelected = (templatePayload: any) => {
    activitySelectionStore.setSelection(templatePayload);
    router.push("/record");
  };

  // Handle planned activity selection
  const handlePlannedActivitySelected = (plannedActivityPayload: any) => {
    activitySelectionStore.setSelection(plannedActivityPayload);
    router.push("/record");
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Discover" />
      {/* Header with Tabs */}
      <View className="px-4 pt-4 pb-4 border-b border-border bg-background">
        {/* Tab Navigation */}
        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="templates"
              className="flex-row items-center gap-2"
            >
              <Icon as={Zap} size={16} />
              <Text className="text-sm font-medium">Templates</Text>
            </TabsTrigger>
            <TabsTrigger
              value="quick-start"
              className="flex-row items-center gap-2"
            >
              <Icon as={Activity} size={16} />
              <Text className="text-sm font-medium">Quick Start</Text>
            </TabsTrigger>
            <TabsTrigger
              value="planned"
              className="flex-row items-center gap-2"
            >
              <Icon as={Clock} size={16} />
              <Text className="text-sm font-medium">Planned</Text>
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="flex-1"
      >
        {/* Templates Tab */}
        <TabsContent value="templates" className="flex-1 mt-0">
          <ScrollView className="flex-1">
            {isFilterMode ? (
              // Filtered List View
              <View className="p-4">
                <Text className="text-sm text-muted-foreground mb-4">
                  {filteredActivities.length} result
                  {filteredActivities.length !== 1 ? "s" : ""}
                </Text>

                {filteredActivities.map((activity, index) => (
                  <ActivityPlanCard
                    key={`${activity.activity_category}-${activity.activity_location}-${index}`}
                    activityPlan={transformTemplateToActivityPlan(
                      activity,
                      profile,
                    )}
                    onPress={() => handleTemplatePress(activity)}
                    variant="default"
                  />
                ))}

                {filteredActivities.length === 0 && (
                  <View className="items-center justify-center py-12">
                    <Text className="text-muted-foreground text-center">
                      No activities found matching your criteria
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              // Default Categorized Rows View
              <View className="py-4">
                {CATEGORIES.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    profile={profile}
                    onViewAll={() => handleViewAll(category.id)}
                    onTemplatePress={handleTemplatePress}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </TabsContent>

        {/* Quick Start Tab */}
        <TabsContent value="quick-start" className="flex-1 mt-0">
          <ScrollView className="flex-1 p-4">
            <View className="mb-2">
              <Text className="text-sm text-muted-foreground">
                Start a new activity immediately
              </Text>
            </View>
            <QuickStartList onActivitySelect={handleQuickStart} />
          </ScrollView>
        </TabsContent>

        {/* Planned Activities Tab */}
        <TabsContent value="planned" className="flex-1 mt-0">
          <ScrollView className="flex-1 p-4">
            <View className="mb-2">
              <Text className="text-sm text-muted-foreground">
                Your scheduled activities
              </Text>
            </View>
            <PlannedActivitiesList
              onActivitySelect={handlePlannedActivitySelected}
            />
          </ScrollView>
        </TabsContent>
      </Tabs>

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
  profile: any;
  onViewAll: () => void;
  onTemplatePress: (template: any) => void;
}

function CategoryRow({
  category,
  profile,
  onViewAll,
  onTemplatePress,
}: CategoryRowProps) {
  // Get all activities for this category
  const activities = useMemo(() => {
    const allActivities: any[] = [];

    category.subcategories.forEach((sub) => {
      const activities = getSampleActivitiesByCategory(
        sub.category as any,
        sub.location as any,
      );
      allActivities.push(...activities);
    });

    return allActivities;
  }, [category]);

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
        keyExtractor={(item, index) =>
          `${item.activity_category}-${item.activity_location}-${index}`
        }
        renderItem={({ item }) => (
          <View style={{ width: 280 }}>
            <ActivityPlanCard
              activityPlan={transformTemplateToActivityPlan(item, profile)}
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
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50">
        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPress={onClose}
        />

        <View className="bg-background rounded-t-3xl p-6 pb-8">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-2xl font-bold">Filter Activities</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon as={X} size={24} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>

          {/* Categories */}
          <Text className="text-sm text-muted-foreground mb-3">Categories</Text>

          <View className="gap-3 mb-6">
            {CATEGORIES.map((category) => {
              const isSelected = selectedCategories.includes(category.id);

              return (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => toggleCategory(category.id)}
                  className={`flex-row items-center p-4 rounded-xl border ${
                    isSelected
                      ? "bg-primary/10 border-primary"
                      : "bg-card border-border"
                  }`}
                >
                  <View className="w-12 h-12 rounded-full bg-muted items-center justify-center mr-3">
                    <Icon
                      as={category.icon}
                      size={24}
                      className={category.color}
                    />
                  </View>

                  <View className="flex-1">
                    <Text className="font-semibold">{category.name}</Text>
                  </View>

                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                      <Text className="text-primary-foreground text-xs font-bold">
                        ✓
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Apply Button */}
          <Button onPress={onClose} className="w-full">
            <Text className="font-semibold">Apply Filters</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
