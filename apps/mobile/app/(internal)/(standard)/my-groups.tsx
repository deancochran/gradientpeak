import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  GroupEmptyState,
  GroupEventEmptyState,
  GroupEventList,
  GroupList,
} from "@/components/groups";
import {
  type GroupEventListItem,
  type GroupListItem,
  useGroupListViewModel,
  useMyUpcomingGroupEventsViewModel,
} from "@/lib/groups";
import { usePerformanceScreenReady } from "@/lib/performance";

type MyGroupsTab = "events" | "groups";

const MY_GROUPS_TABS: Array<{ label: string; value: MyGroupsTab }> = [
  { label: "Upcoming events", value: "events" },
  { label: "My groups", value: "groups" },
];

export default function MyGroupsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MyGroupsTab>("events");
  const startsAfter = useMemo(() => new Date().toISOString(), []);
  const groupsVm = useGroupListViewModel({ kind: "mine" });
  const upcomingEventsVm = useMyUpcomingGroupEventsViewModel({ startsAfter });
  usePerformanceScreenReady("route-my-groups");

  const openGroup = (group: GroupListItem | NonNullable<GroupEventListItem["group"]>) => {
    router.push({
      pathname: "/group-detail",
      params: { groupId: group.id, returnTo: "my-groups" },
    });
  };

  const header = (
    <View className="gap-4">
      <Tabs onValueChange={(tab) => setActiveTab(tab as MyGroupsTab)} value={activeTab}>
        <TabsList className="flex-row rounded-2xl border border-border bg-muted/40 p-1">
          {MY_GROUPS_TABS.map((tab) => {
            const isActive = tab.value === activeTab;
            return (
              <TabsTrigger
                accessibilityState={{ selected: isActive }}
                className={
                  isActive
                    ? "flex-1 rounded-xl bg-background px-3 py-2 shadow-sm"
                    : "flex-1 rounded-xl px-3 py-2"
                }
                key={tab.value}
                testId={`my-groups-tab-${tab.value}`}
                value={tab.value}
              >
                <Text
                  className={
                    isActive
                      ? "text-center text-sm font-semibold text-foreground"
                      : "text-center text-sm font-semibold text-muted-foreground"
                  }
                >
                  {tab.label}
                </Text>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">
          {activeTab === "events" ? "Your upcoming events" : "Your groups"}
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {activeTab === "events"
            ? "Events from your groups, ordered by what is next."
            : "Groups you create or join appear here."}
        </Text>
      </View>

      {activeTab === "groups" ? (
        <Button onPress={() => router.push("/group-create")} variant="outline">
          <Text className="text-sm font-semibold text-foreground">Create group</Text>
        </Button>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background" testID="my-groups-screen">
      {activeTab === "events" ? (
        <GroupEventList
          contentContainerClassName="gap-4 p-6 pb-10"
          emptyComponent={
            <GroupEventEmptyState
              actionLabel="View my groups"
              description="Join a group or check back when your groups schedule their next sessions."
              onActionPress={() => setActiveTab("groups")}
              title="No upcoming group events"
            />
          }
          events={upcomingEventsVm.events}
          hasNextPage={upcomingEventsVm.hasNextPage}
          isError={upcomingEventsVm.isError}
          isFetchingNextPage={upcomingEventsVm.isFetchingNextPage}
          isLoading={upcomingEventsVm.isLoading}
          ListHeaderComponent={header}
          onEventPress={(event) =>
            router.push({ pathname: "/group-event-detail", params: { groupEventId: event.id } })
          }
          onGroupPress={openGroup}
          onLoadMore={() => upcomingEventsVm.fetchNextPage()}
          onRefresh={upcomingEventsVm.refetch}
          refreshing={upcomingEventsVm.isFetching && !upcomingEventsVm.isFetchingNextPage}
        />
      ) : (
        <GroupList
          contentContainerClassName="gap-4 p-6 pb-10"
          emptyComponent={
            <GroupEmptyState
              description="Create a group or join one from Community search."
              title="No groups yet"
            />
          }
          groups={groupsVm.groups}
          hasNextPage={groupsVm.hasNextPage}
          isError={groupsVm.isError}
          isFetchingNextPage={groupsVm.isFetchingNextPage}
          isLoading={groupsVm.isLoading}
          ListHeaderComponent={header}
          onGroupPress={openGroup}
          onLoadMore={() => groupsVm.fetchNextPage()}
          onRefresh={groupsVm.refetch}
          refreshing={groupsVm.isFetching && !groupsVm.isFetchingNextPage}
        />
      )}
    </View>
  );
}
