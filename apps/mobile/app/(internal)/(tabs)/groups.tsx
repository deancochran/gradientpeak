import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import {
  GroupEmptyState,
  GroupEventEmptyState,
  GroupEventList,
  GroupList,
} from "@/components/groups";
import { AppHeader } from "@/components/shared";
import {
  type GroupEventListItem,
  type GroupListItem,
  useGroupListViewModel,
  useMyUpcomingGroupEventsViewModel,
} from "@/lib/groups";
import { usePerformanceScreenReady } from "@/lib/performance";

type GroupsTabKey = "events" | "groups";

const GROUPS_TABS: Array<{ key: GroupsTabKey; label: string }> = [
  { key: "events", label: "Upcoming events" },
  { key: "groups", label: "My groups" },
];

function GroupsTabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: GroupsTabKey;
  onTabChange: (tab: GroupsTabKey) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-2xl border border-border bg-muted/40 p-1"
    >
      {GROUPS_TABS.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            activeOpacity={0.85}
            className={
              isActive
                ? "flex-1 rounded-xl bg-background px-3 py-2 shadow-sm"
                : "flex-1 rounded-xl px-3 py-2"
            }
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            testID={`groups-tab-${tab.key}`}
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
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function GroupsScreen() {
  const router = useRouter();
  usePerformanceScreenReady("route-groups");
  const [activeTab, setActiveTab] = useState<GroupsTabKey>("events");
  const startsAfter = useMemo(() => new Date().toISOString(), []);
  const groupsVm = useGroupListViewModel({ kind: "mine" });
  const upcomingEventsVm = useMyUpcomingGroupEventsViewModel({
    startsAfter,
  });

  const openGroup = (group: GroupListItem) => {
    router.push({ pathname: "/group-detail", params: { groupId: group.id } });
  };

  const openEventGroup = (group: NonNullable<GroupEventListItem["group"]>) => {
    router.push({ pathname: "/group-detail", params: { groupId: group.id } });
  };

  const openGroupDiscovery = () => {
    router.push({ pathname: "/(internal)/(tabs)/discover", params: { scope: "groups", q: "" } });
  };

  const openEvent = (event: GroupEventListItem) => {
    router.push({ pathname: "/group-event-detail", params: { groupEventId: event.id } });
  };

  const header = (
    <View className="gap-4">
      <GroupsTabToggle activeTab={activeTab} onTabChange={setActiveTab} />

      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">
          {activeTab === "events" ? "Upcoming group events" : "Your groups"}
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {activeTab === "events"
            ? "Events from groups you belong to, sorted by what is next."
            : "Groups you create or join appear here. Discover new groups from global search."}
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
    <View className="flex-1 bg-background" testID="groups-screen">
      <AppHeader title="Groups" />
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
          onEventPress={openEvent}
          onGroupPress={openEventGroup}
          onLoadMore={() => upcomingEventsVm.fetchNextPage()}
          onRefresh={upcomingEventsVm.refetch}
          refreshing={upcomingEventsVm.isFetching && !upcomingEventsVm.isFetchingNextPage}
        />
      ) : (
        <GroupList
          contentContainerClassName="gap-4 p-6 pb-10"
          emptyComponent={
            <GroupEmptyState
              actionLabel="Search Discover"
              description="Search global Discover to find clubs, teams, rosters, and local training groups."
              onActionPress={openGroupDiscovery}
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
