import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  Loader2,
  MapPin,
  Search,
  UserPlus,
  Users,
  Waves,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Dimensions, FlatList, Modal, ScrollView, TouchableOpacity, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const TABS = [
  { id: "activityPlans", label: "Activity Plans", icon: Activity },
  { id: "trainingPlans", label: "Training Plans", icon: Dumbbell },
  { id: "routes", label: "Routes", icon: MapPin },
  { id: "users", label: "Users", icon: Users },
] as const;

export type TabType = (typeof TABS)[number]["id"];

const CATEGORIES = [
  {
    id: "run",
    name: "Running",
    icon: Footprints,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    subcategories: [{ category: "run", label: "Running" }],
  },
  {
    id: "bike",
    name: "Cycling",
    icon: Bike,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    subcategories: [{ category: "bike", label: "Cycling" }],
  },
  {
    id: "swim",
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    subcategories: [{ category: "swim", label: "Swimming" }],
  },
  {
    id: "strength",
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-50",
    subcategories: [{ category: "strength", label: "Strength Training" }],
  },
  {
    id: "other",
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    subcategories: [{ category: "other", label: "Other Activities" }],
  },
] as const;

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function DiscoverPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("activityPlans");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const isSearchMode = debouncedSearch.trim() !== "";

  const activityPlansInfiniteQuery = trpc.activityPlans.list.useInfiniteQuery(
    {
      includeSystemTemplates: true,
      includeOwnOnly: false,
      ownerScope: "all",
      search: debouncedSearch || undefined,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const trainingPlansQuery = trpc.trainingPlans.listTemplates.useQuery({
    search: debouncedSearch || undefined,
  });

  const routesInfiniteQuery = trpc.routes.list.useInfiniteQuery(
    {
      search: debouncedSearch || undefined,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const usersQuery = trpc.social.searchUsers.useQuery({
    query: debouncedSearch || undefined,
    limit: 20,
    offset: 0,
  });

  const activityPlans = useMemo(() => {
    return activityPlansInfiniteQuery.data?.pages.flatMap((page) => page.items) || [];
  }, [activityPlansInfiniteQuery.data]);

  const routes = useMemo(() => {
    return routesInfiniteQuery.data?.pages.flatMap((page) => page.items) || [];
  }, [routesInfiniteQuery.data]);

  const trainingPlans = trainingPlansQuery.data || [];

  const users = usersQuery.data?.users || [];

  const filteredActivities = useMemo(() => {
    let activities = activityPlans;

    if (selectedCategories.length > 0) {
      activities = activities.filter((activity) => {
        return selectedCategories.includes(activity.activity_category || "");
      });
    }

    return activities;
  }, [activityPlans, selectedCategories]);

  const handleTemplatePress = (template: any) => {
    router.push({
      pathname: "/(internal)/(standard)/activity-plan-detail",
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    });
  };

  const handleTrainingPlanPress = (template: any) => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.DETAIL(template.id) as any);
  };

  const handleRoutePress = (route: any) => {
    router.push({
      pathname: "/(internal)/(standard)/route-detail",
      params: {
        id: route.id,
      },
    });
  };

  const handleUserPress = (user: any) => {
    router.push({
      pathname: "/(internal)/(standard)/user/[userId]",
      params: {
        userId: user.id,
      },
    });
  };

  const handleViewAll = (categoryId: string) => {
    setSearchQuery("");
    setSelectedCategories([categoryId]);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
  };

  const renderTabBar = () => (
    <View className="flex-row bg-background px-2 pt-2 pb-3 border-b border-border">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 px-1 rounded-lg ${
              isActive ? "bg-primary" : "bg-transparent"
            }`}
          >
            <Icon
              as={tab.icon}
              size={16}
              className={isActive ? "text-primary-foreground" : "text-muted-foreground"}
            />
            <Text
              className={`text-xs font-medium ${
                isActive ? "text-primary-foreground" : "text-muted-foreground"
              }`}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderSearchInput = () => (
    <View className="px-4 pt-4 pb-3 border-b border-border bg-background">
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input
            placeholder="Search users, activities, plans..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="h-12 pr-10"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onPress={() => setSearchQuery("")}
            >
              <Icon as={X} size={20} className="text-muted-foreground" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearchMode && (
        <View className="flex-row items-center gap-2 mt-2">
          <Icon as={Search} size={14} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">Searching: {`"${debouncedSearch}"`}</Text>
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text className="text-sm text-primary font-medium">Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderLoadingSkeleton = () => (
    <View className="p-4 gap-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
      ))}
    </View>
  );

  const renderEmptyState = (message: string) => (
    <View className="px-4 py-12">
      <EmptyStateCard icon={Search} title={message} description="Try adjusting your search" />
    </View>
  );

  const renderActivityPlansContent = () => {
    if (!isSearchMode) {
      return (
        <ScrollView className="flex-1 py-4">
          {CATEGORIES.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              activities={activityPlans.filter((p) => p.activity_category === category.id)}
              onViewAll={() => handleViewAll(category.id)}
              onTemplatePress={handleTemplatePress}
            />
          ))}
          <View className="h-8" />
        </ScrollView>
      );
    }

    if (activityPlansInfiniteQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (filteredActivities.length === 0) {
      return renderEmptyState("No activity plans found");
    }

    return (
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
        ListEmptyComponent={renderEmptyState("No activity plans found")}
        onRefresh={() => activityPlansInfiniteQuery.refetch()}
        refreshing={activityPlansInfiniteQuery.isRefetching}
      />
    );
  };

  const renderTrainingPlansContent = () => {
    if (trainingPlansQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (trainingPlans.length === 0) {
      return renderEmptyState("No training plans found");
    }

    return (
      <FlatList
        data={trainingPlans}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrainingPlanCard template={item} onPress={() => handleTrainingPlanPress(item)} />
        )}
        ListEmptyComponent={renderEmptyState("No training plans found")}
        onRefresh={() => trainingPlansQuery.refetch()}
        refreshing={trainingPlansQuery.isRefetching}
      />
    );
  };

  const renderRoutesContent = () => {
    if (routesInfiniteQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (routes.length === 0) {
      return renderEmptyState("No routes found");
    }

    return (
      <FlatList
        data={routes}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RouteCard route={item} onPress={() => handleRoutePress(item)} />}
        ListEmptyComponent={renderEmptyState("No routes found")}
        onRefresh={() => routesInfiniteQuery.refetch()}
        refreshing={routesInfiniteQuery.isRefetching}
        onEndReached={() => routesInfiniteQuery.fetchNextPage()}
        ListFooterComponent={
          routesInfiniteQuery.hasNextPage ? (
            <View className="py-4">
              <Button
                variant="outline"
                className="w-full"
                onPress={() => routesInfiniteQuery.fetchNextPage()}
                disabled={routesInfiniteQuery.isFetchingNextPage}
              >
                <Text className="text-primary">
                  {routesInfiniteQuery.isFetchingNextPage ? "Loading more..." : "Load More"}
                </Text>
              </Button>
            </View>
          ) : null
        }
      />
    );
  };

  const renderUsersContent = () => {
    if (usersQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (users.length === 0) {
      return renderEmptyState("No users found");
    }

    return (
      <FlatList
        data={users}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <UserCard user={item} onPress={() => handleUserPress(item)} />}
        ListEmptyComponent={renderEmptyState("No users found")}
        onRefresh={() => usersQuery.refetch()}
        refreshing={usersQuery.isRefetching}
      />
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "activityPlans":
        return renderActivityPlansContent();
      case "trainingPlans":
        return renderTrainingPlansContent();
      case "routes":
        return renderRoutesContent();
      case "users":
        return renderUsersContent();
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Discover" />
      {renderSearchInput()}
      {renderTabBar()}
      {renderContent()}
    </View>
  );
}

interface CategoryRowProps {
  category: (typeof CATEGORIES)[number];
  activities: any[];
  onViewAll: () => void;
  onTemplatePress: (template: any) => void;
}

function CategoryRow({ category, activities, onViewAll, onTemplatePress }: CategoryRowProps) {
  if (activities.length === 0) return null;

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between px-4 mb-3">
        <View className="flex-row items-center gap-2">
          <Icon as={category.icon} size={20} className={category.color} />
          <Text className="text-xl font-semibold">{category.name}</Text>
        </View>

        <TouchableOpacity onPress={onViewAll}>
          <Text className="text-sm text-primary font-medium">View All</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        data={activities.slice(0, 5)}
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

interface TrainingPlanCardProps {
  template: any;
  onPress: () => void;
}

function TrainingPlanCard({ template, onPress }: TrainingPlanCardProps) {
  return (
    <TouchableOpacity onPress={onPress} className="bg-card border border-border rounded-xl p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">{template.name}</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            {template.durationWeeks?.recommended || template.durationWeeks?.min} weeks
          </Text>
        </View>
        <View className="bg-primary/10 px-2 py-1 rounded-full">
          <Text className="text-xs font-medium text-primary capitalize">
            {template.experienceLevel}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2 mt-3">
        {template.sport?.map((s: string) => (
          <View key={s} className="bg-muted px-2 py-1 rounded-md">
            <Text className="text-xs text-muted-foreground capitalize">{s}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

interface RouteCardProps {
  route: any;
  onPress: () => void;
}

function RouteCard({ route, onPress }: RouteCardProps) {
  const distanceKm = route.total_distance ? (route.total_distance / 1000).toFixed(1) : "0";
  const elevationM = route.total_ascent || 0;

  return (
    <TouchableOpacity onPress={onPress} className="bg-card border border-border rounded-xl p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">{route.name}</Text>
          {route.description && (
            <Text className="text-sm text-muted-foreground mt-1" numberOfLines={2}>
              {route.description}
            </Text>
          )}
        </View>
        <View className="bg-primary/10 px-2 py-1 rounded-full">
          <Text className="text-xs font-medium text-primary capitalize">
            {route.activity_category}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-4 mt-3">
        <View className="flex-row items-center gap-1">
          <Icon as={MapPin} size={14} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">{distanceKm} km</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon as={Activity} size={14} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">{elevationM} m</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface UserCardProps {
  user: any;
  onPress: () => void;
}

function UserCard({ user, onPress }: UserCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-card border border-border rounded-xl p-4 flex-row items-center gap-3"
    >
      <Avatar alt={user.username || "User"} className="h-12 w-12">
        <AvatarImage source={{ uri: user.avatar_url }} />
        <AvatarFallback>
          <Text className="text-sm font-medium text-foreground">
            {user.username?.slice(0, 2).toUpperCase()}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1">
        <Text className="text-lg font-semibold text-foreground">{user.username}</Text>
        <Text className="text-sm text-muted-foreground">
          {user.is_public ? "Public Profile" : "Private Profile"}
        </Text>
      </View>
      <Button size="sm" variant="outline" className="h-9">
        <Icon as={UserPlus} size={16} className="text-primary mr-1" />
        <Text className="text-primary text-sm">Follow</Text>
      </Button>
    </TouchableOpacity>
  );
}
