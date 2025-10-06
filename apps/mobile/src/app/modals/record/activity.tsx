import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import {
  useActivityRecorder,
  useRecorderActions,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { useRequireAuth } from "@/lib/hooks/useAuth";
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
  const router = useRouter();
  const { profile } = useRequireAuth();
  const hasClosed = useRef(false);
  const [tab, setTab] = useState("quick");

  // Service and state
  const service = useActivityRecorder(profile || null);
  const state = useRecordingState(service);
  const { selectActivity, selectPlannedActivity } = useRecorderActions(service);

  const canSelect = state === "pending" || state === "ready";

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
      limit: PAGE_SIZE,
    },
    {
      enabled: canSelect,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  // Flatten all pages into single array
  const plannedActivities: PlannedActivityItem[] =
    data?.pages.flatMap((page) => page.items) ?? [];

  // Auto-close modal when recording starts
  useEffect(() => {
    if (!canSelect && !hasClosed.current) {
      hasClosed.current = true;
      router.back();
    }
  }, [canSelect, router]);

  if (!canSelect) return null;

  // ===== LIST DATA BUILDER =====
  const buildListData = (): ListItem[] => {
    const items: ListItem[] = [];

    if (plannedActivities.length > 0) {
      items.push({ type: "header", label: "Scheduled" });
      plannedActivities.forEach((activity) => {
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

  // ===== HANDLERS =====
  const handleSelectPlannedActivity = (plan: PlannedActivityItem) => {
    selectPlannedActivity(
      {
        ...plan.activity_plan,
        structure: plan.activity_plan.structure as ActivityPlanStructure,
      },
      plan.id,
    );
    router.back();
  };

  const handleSelectTemplate = (plan: RecordingServiceActivityPlan) => {
    selectPlannedActivity(plan);
    router.back();
  };

  const handleSelectQuickStart = (type: PublicActivityType) => {
    selectActivity(type);
    router.back();
  };

  // ===== RENDER FUNCTIONS =====
  const renderQuickStartItem = (type: PublicActivityType, name: string) => {
    const IconComponent = ACTIVITY_ICONS[type];

    return (
      <Pressable
        key={type}
        onPress={() => handleSelectQuickStart(type)}
        className={`flex-row items-center py-4 px-4 `}
      >
        <View
          className={`w-10 h-10 rounded-full items-center justify-center mr-3 `}
        >
          <Icon as={IconComponent} size={18} />
        </View>
        <Text className={`flex-1 text-base `}>{name}</Text>
      </Pressable>
    );
  };

  const renderPlanItem = (
    plan: RecordingServiceActivityPlan,
    onPress: () => void,
  ) => {
    const IconComponent = ACTIVITY_ICONS[plan.activity_type];

    return (
      <Pressable onPress={onPress}>
        <View className="flex-row items-start mb-2">
          <View
            className={`w-10 h-10 rounded-full items-center justify-center mr-3`}
          >
            <Icon as={IconComponent} size={18} />
          </View>
          <View className="flex-1">
            <Text className={`text-base mb-1`}>{plan.name}</Text>
            {plan.description && (
              <Text className="text-sm text-muted-foreground leading-5">
                {plan.description}
              </Text>
            )}
          </View>
        </View>
        <View className="flex-row gap-4 ml-13">
          {plan.estimated_duration && (
            <View className="flex-row items-center gap-1.5">
              <Icon as={Clock} size={14} className="text-muted-foreground" />
              <Text className="text-sm text-muted-foreground">
                {Math.round(plan.estimated_duration / 60)} min
              </Text>
            </View>
          )}
          {plan.activity_type && (
            <View className="flex-row items-center gap-1.5">
              <Icon as={Activity} size={14} className="text-muted-foreground" />
              <Text className="text-sm text-muted-foreground">
                {ACTIVITY_NAMES[plan.activity_type]}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderListItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case "header":
        return (
          <View className="px-4 pt-5 pb-2 bg-background">
            <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {item.label}
            </Text>
          </View>
        );

      case "planned": {
        return renderPlanItem(
          item.data.activity_plan as unknown as RecordingServiceActivityPlan,
          () => handleSelectPlannedActivity(item.data),
        );
      }

      case "template": {
        return renderPlanItem(item.data, () => handleSelectTemplate(item.data));
      }

      case "empty":
        return (
          <View className="flex-1 items-center justify-center py-20 px-8">
            <Icon
              as={Calendar}
              size={56}
              className="text-muted-foreground/20 mb-4"
            />
            <Text className="text-base font-medium text-muted-foreground mb-1">
              No plans available
            </Text>
            <Text className="text-sm text-muted-foreground/70 text-center">
              Create a training plan to see it here
            </Text>
          </View>
        );
    }
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View className="py-6 items-center">
        <ActivityIndicator size="small" />
      </View>
    );
  };

  const renderError = () => (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Icon as={AlertCircle} size={56} className="text-destructive mb-4" />
      <Text className="text-base font-semibold text-destructive mb-2">
        Failed to load plans
      </Text>
      <Text className="text-sm text-muted-foreground text-center mb-6 leading-5">
        {error?.message || "An unexpected error occurred"}
      </Text>
      <Button onPress={() => refetch()} variant="outline">
        <Text>Try Again</Text>
      </Button>
    </View>
  );

  const renderLoading = () => (
    <View className="flex-1 items-center justify-center py-20">
      <ActivityIndicator size="large" />
      <Text className="text-sm text-muted-foreground mt-4">
        Loading plans...
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="border-b border-border px-2 py-2 flex-row items-center bg-background">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center text-lg font-semibold">
          Select Activity
        </Text>
        <View className="w-10" />
      </View>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1">
        <View className="border-b border-border bg-background">
          <TabsList className="w-full">
            <TabsTrigger value="quick" className="flex-1">
              <Icon as={Zap} size={16} className="mr-2" />
              <Text>Quick Start</Text>
            </TabsTrigger>
            <TabsTrigger value="planned" className="flex-1">
              <Icon as={Calendar} size={16} className="mr-2" />
              <Text>My Plans</Text>
            </TabsTrigger>
          </TabsList>
        </View>

        {/* Quick Start Tab */}
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
            contentContainerClassName="py-2"
          />
        </TabsContent>

        {/* My Plans Tab */}
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
              contentContainerClassName="pb-4"
            />
          )}
        </TabsContent>
      </Tabs>
    </View>
  );
}
