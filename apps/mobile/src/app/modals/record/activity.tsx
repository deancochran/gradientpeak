import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { trpc } from "@/lib/trpc";
import {
  ActivityPlanStructure,
  PublicActivityPlansRow,
  PublicActivityType,
  PublicPlannedActivitiesRow,
  RecordingServiceActivityPlan,
  SAMPLE_ACTIVITIES,
} from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  AlertCircle,
  Bike,
  Calendar,
  ChevronLeft,
  Clock,
  Dumbbell,
  Footprints,
  Waves,
  Zap,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

// ===== CONSTANTS =====
const PAGE_SIZE = 20;

const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Run",
  outdoor_bike: "Bike",
  indoor_bike_trainer: "Trainer",
  indoor_treadmill: "Treadmill",
  indoor_strength: "Strength",
  indoor_swim: "Swim",
  other: "Other",
};

const ACTIVITY_ICONS: Record<PublicActivityType, any> = {
  outdoor_run: Footprints,
  outdoor_bike: Bike,
  indoor_bike_trainer: Bike,
  indoor_treadmill: Footprints,
  indoor_strength: Dumbbell,
  indoor_swim: Waves,
  other: Activity,
};

// ===== TYPES =====
type PlannedActivityItem = PublicPlannedActivitiesRow & {
  activity_plan: PublicActivityPlansRow;
};

type ListItem =
  | { type: "planned"; data: PlannedActivityItem }
  | { type: "template"; data: RecordingServiceActivityPlan }
  | { type: "header"; label: string }
  | { type: "empty" };

export default function ActivitySelectionModal() {
  const service = useActivityRecorder();
  const router = useRouter();
  const hasClosed = useRef(false);
  const [tab, setTab] = useState("quick");

  const canSelect = service.state === "pending" || service.state === "ready";

  // TRPC infinite query with cursor-based pagination
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = trpc.plannedActivities.list.useInfiniteQuery(
    {
      activity_type: service.selectedActivityType,
      activity_plan_id: service.planManager?.plannedActivityId,
      limit: PAGE_SIZE,
    },
    {
      enabled: !!service.selectedActivityType,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  // Flatten all pages into single array
  const planned_activities: PlannedActivityItem[] =
    data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!canSelect && !hasClosed.current) {
      hasClosed.current = true;
      router.back();
    }
  }, [canSelect, router]);

  if (!canSelect) return null;

  // Build flat list data
  const buildListData = (): ListItem[] => {
    const items: ListItem[] = [];

    if (planned_activities.length > 0) {
      items.push({ type: "header", label: "Scheduled" });
      planned_activities.forEach((activity) => {
        items.push({ type: "planned", data: activity });
      });
    }

    if (SAMPLE_ACTIVITIES.length > 0) {
      items.push({ type: "header", label: "Templates" });
      SAMPLE_ACTIVITIES.forEach((activity) => {
        items.push({ type: "template", data: activity });
      });
    }

    if (items.length === 0) {
      items.push({ type: "empty" });
    }

    return items;
  };

  const listData = buildListData();

  const handleSelect = (
    plan: PlannedActivityItem | RecordingServiceActivityPlan,
    isPlanned: boolean,
  ) => {
    if (isPlanned && "activity_plan" in plan) {
      service.selectPlannedActivity(
        {
          ...plan.activity_plan,
          structure: plan.activity_plan.structure as ActivityPlanStructure,
        },
        plan.id,
      );
    } else {
      service.selectPlannedActivity(plan as RecordingServiceActivityPlan);
    }
    router.back();
  };

  const handleSelectType = (type: PublicActivityType) => {
    service.selectUnplannedActivity(type);
    router.back();
  };

  const renderQuickStartItem = (type: PublicActivityType, name: string) => {
    const IconComponent = ACTIVITY_ICONS[type];
    const isSelected = service.selectedActivityType === type;

    return (
      <Pressable
        key={type}
        onPress={() => handleSelectType(type)}
        className={`flex-row items-center py-3 px-4 ${
          isSelected ? "bg-primary/5" : ""
        }`}
      >
        <View className="w-8 h-8 rounded-full bg-muted items-center justify-center mr-3">
          <Icon as={IconComponent} size={16} />
        </View>
        <Text className="flex-1">{name}</Text>
        {isSelected && <View className="w-2 h-2 rounded-full bg-primary" />}
      </Pressable>
    );
  };

  const renderPlanItem = (
    plan: RecordingServiceActivityPlan,
    onPress: () => void,
  ) => (
    <Pressable onPress={onPress} className="py-3 px-4">
      <Text className="font-medium mb-1">{plan.name}</Text>
      {plan.description && (
        <Text className="text-sm text-muted-foreground mb-2">
          {plan.description}
        </Text>
      )}
      <View className="flex-row gap-3">
        {plan.estimated_duration && (
          <View className="flex-row items-center gap-1">
            <Icon as={Clock} size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">
              {Math.round(plan.estimated_duration / 60)}m
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  const renderListItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case "header":
        return (
          <View className="px-4 pt-4 pb-2">
            <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {item.label}
            </Text>
          </View>
        );

      case "planned":
        return renderPlanItem(
          item.data.activity_plan as unknown as RecordingServiceActivityPlan,
          () => handleSelect(item.data, true),
        );

      case "template":
        return renderPlanItem(item.data, () => handleSelect(item.data, false));

      case "empty":
        return (
          <View className="flex-1 items-center justify-center py-16 px-8">
            <Icon
              as={Calendar}
              size={48}
              className="text-muted-foreground/30 mb-3"
            />
            <Text className="text-muted-foreground text-center">
              No plans available
            </Text>
          </View>
        );
    }
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" />
      </View>
    );
  };

  const renderError = () => (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Icon as={AlertCircle} size={48} className="text-destructive mb-3" />
      <Text className="text-destructive text-center font-medium mb-2">
        Failed to load
      </Text>
      <Text className="text-xs text-muted-foreground text-center mb-4">
        {error?.message || "An error occurred"}
      </Text>
      <Button onPress={() => refetch()} variant="outline" size="sm">
        <Text>Retry</Text>
      </Button>
    </View>
  );

  const renderLoading = () => (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="border-b border-border px-2 py-2 flex-row items-center">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">
          Select Activity
        </Text>
        <View className="w-10" />
      </View>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1">
        <View className="border-b border-border">
          <TabsList className="w-full">
            <TabsTrigger value="quick" className="flex-1">
              <Icon as={Zap} size={14} className="mr-1" />
              <Text>Quick</Text>
            </TabsTrigger>
            <TabsTrigger value="planned" className="flex-1">
              <Icon as={Calendar} size={14} className="mr-1" />
              <Text>Plans</Text>
            </TabsTrigger>
          </TabsList>
        </View>

        {/* Quick Start */}
        <TabsContent value="quick" className="flex-1">
          <FlatList
            data={Object.entries(ACTIVITY_NAMES)}
            renderItem={({ item }) =>
              renderQuickStartItem(item[0] as PublicActivityType, item[1])
            }
            keyExtractor={(item) => item[0]}
            ItemSeparatorComponent={() => (
              <View className="h-px bg-border mx-4" />
            )}
          />
        </TabsContent>

        {/* My Plans */}
        <TabsContent value="planned" className="flex-1">
          {isLoading ? (
            renderLoading()
          ) : isError ? (
            renderError()
          ) : (
            <FlatList
              data={listData}
              renderItem={renderListItem}
              keyExtractor={(item, index) => `${item.type}-${index}`}
              ItemSeparatorComponent={({ leadingItem }) =>
                leadingItem.type !== "header" &&
                leadingItem.type !== "empty" ? (
                  <View className="h-px bg-border mx-4" />
                ) : null
              }
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={renderFooter()}
            />
          )}
        </TabsContent>
      </Tabs>
    </View>
  );
}
