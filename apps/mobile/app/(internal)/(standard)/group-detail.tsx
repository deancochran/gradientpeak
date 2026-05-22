import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import {
  CurrentGroupEventPlanCard,
  GroupAccessLevelBadge,
  GroupEventCard,
  GroupEventEmptyState,
  GroupEventListSkeleton,
  GroupJoinPolicyBadge,
  GroupMembersOnlyLockedState,
  GroupPrimaryActionBar,
  GroupRelationshipBadge,
} from "@/components/groups";
import {
  DetailOverflowMenu,
  type DetailOverflowMenuAction,
  DetailScaffold,
} from "@/components/shared/detail";
import {
  type GroupMember,
  useGroupActions,
  useGroupDetailViewModel,
  useGroupEventListViewModel,
} from "@/lib/groups";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function groupInitials(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return "G";

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

type GroupEventTab = "upcoming" | "past";

function GroupEventTabs({
  onChange,
  value,
}: {
  onChange: (value: GroupEventTab) => void;
  value: GroupEventTab;
}) {
  const tabs: { label: string; value: GroupEventTab }[] = [
    { label: "Upcoming", value: "upcoming" },
    { label: "Past", value: "past" },
  ];

  return (
    <View
      className="flex-row self-start rounded-full bg-muted p-1"
      testID="group-detail-event-tabs"
    >
      {tabs.map((tab) => {
        const isActive = value === tab.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            className={`rounded-full px-4 py-2 ${isActive ? "bg-background" : ""}`}
            key={tab.value}
            onPress={() => onChange(tab.value)}
            testID={`group-detail-event-tab-${tab.value}`}
          >
            <Text
              className={`text-center text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MemberAvatarStack({
  hasMore,
  members,
  onPress,
}: {
  hasMore?: boolean;
  members: GroupMember[];
  onPress: () => void;
}) {
  const visibleMembers = members.slice(0, 10);
  const additionalCount = Math.max(0, members.length - visibleMembers.length);

  if (visibleMembers.length === 0) return null;

  return (
    <Pressable accessibilityRole="button" className="items-end gap-1" onPress={onPress}>
      <View className="flex-row-reverse items-center">
        {hasMore || additionalCount > 0 ? (
          <View className="-ml-2 h-8 min-w-8 items-center justify-center rounded-full border-2 border-card bg-muted px-2">
            <Text className="text-[10px] font-semibold text-foreground">
              +{additionalCount}
              {hasMore ? "+" : ""}
            </Text>
          </View>
        ) : null}
        {visibleMembers.map((member) => {
          const displayName = member.profile.username?.trim() || "Athlete";
          return (
            <Avatar
              alt={displayName}
              className="-ml-2 h-8 w-8 border-2 border-card"
              key={member.profile.id}
            >
              {member.profile.avatar_url ? (
                <AvatarImage source={{ uri: member.profile.avatar_url }} />
              ) : null}
              <AvatarFallback>
                <Text className="text-[10px] font-semibold text-foreground">
                  {displayName.charAt(0).toUpperCase() || "A"}
                </Text>
              </AvatarFallback>
            </Avatar>
          );
        })}
      </View>
      <Text className="text-[11px] font-medium text-muted-foreground">
        {members.length}
        {hasMore ? "+" : ""} members
      </Text>
    </Pressable>
  );
}

export default function GroupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; slug?: string }>();
  const groupId = singleParam(params.groupId);
  const slug = singleParam(params.slug);
  const detailVm = useGroupDetailViewModel(groupId ? { groupId } : { slug: slug ?? null });
  const groupActions = useGroupActions();
  const group = detailVm.group;
  const viewer = detailVm.viewer;
  const [eventTab, setEventTab] = useState<GroupEventTab>("upcoming");
  const groupAvatarUrl = group?.avatar_url
    ? getReachableSupabaseStorageUrl(group.avatar_url)
    : null;
  const groupCoverUrl = group?.cover_url ? getReachableSupabaseStorageUrl(group.cover_url) : null;
  const eventStartsAfter = useMemo(() => new Date().toISOString(), []);
  const pastEventStartsAfter = useMemo(() => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    return start.toISOString();
  }, []);
  const upcomingEventsVm = useGroupEventListViewModel({
    enabled: Boolean(viewer?.canViewGroupEvents && detailVm.groupId),
    groupId: detailVm.groupId,
    limit: 20,
    startsAfter: eventStartsAfter,
  });
  const pastEventsVm = useGroupEventListViewModel({
    enabled: Boolean(viewer?.canViewGroupEvents && detailVm.groupId),
    groupId: detailVm.groupId,
    limit: 20,
    startsAfter: pastEventStartsAfter,
    startsBefore: eventStartsAfter,
  });
  const pastEvents = useMemo(
    () =>
      [...pastEventsVm.events].sort(
        (left, right) => new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime(),
      ),
    [pastEventsVm.events],
  );
  const visibleEvents = eventTab === "upcoming" ? upcomingEventsVm.events : pastEvents;
  const visibleEventsVm = eventTab === "upcoming" ? upcomingEventsVm : pastEventsVm;
  const emptyTitle = eventTab === "upcoming" ? "No upcoming events" : "No past events";
  const emptyDescription =
    eventTab === "upcoming"
      ? "Create an event to give members a shared schedule."
      : "Past group events will appear here after they happen.";
  const isWorking =
    groupActions.joinMutation.isPending ||
    groupActions.leaveMutation.isPending ||
    groupActions.requestToJoinMutation.isPending ||
    groupActions.deleteMutation.isPending;

  const handleOpenEvent = (eventId: string) => {
    router.push({
      pathname: "/group-event-detail",
      params: { groupEventId: eventId },
    });
  };

  const handleCreateEvent = () => {
    if (!group) return;
    router.push({ pathname: "/group-event-create", params: { groupId: group.id } });
  };

  const headerActions: DetailOverflowMenuAction[] = [];
  if (group && viewer?.canEditGroup) {
    headerActions.push({
      label: "Edit group",
      onPress: () => router.push({ pathname: "/group-edit", params: { groupId: group.id } }),
      testID: "group-detail-edit",
    });
  }
  if (group && viewer?.canInvite) {
    headerActions.push({
      label: "Requests and invitations",
      onPress: () => router.push({ pathname: "/group-requests", params: { groupId: group.id } }),
      testID: "group-detail-invite",
    });
  }
  if (group && viewer?.canManageMembers) {
    headerActions.push({
      label: "Manage members",
      onPress: () => router.push({ pathname: "/group-members", params: { groupId: group.id } }),
      testID: "group-detail-manage-members",
    });
  }
  if (group && viewer?.canManageJoinRequests) {
    const hasRequestsAction = headerActions.some(
      (action) => action.testID === "group-detail-invite",
    );
    if (!hasRequestsAction) {
      headerActions.push({
        label: "Requests and invitations",
        onPress: () => router.push({ pathname: "/group-requests", params: { groupId: group.id } }),
        testID: "group-detail-join-requests",
      });
    }
  }
  if (group && viewer?.canLeave) {
    headerActions.push({
      label: "Leave group",
      onPress: () => {
        Alert.alert("Leave group", `Leave ${group.name}?`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: async () => {
              try {
                await groupActions.leaveGroup(group.id);
              } catch (error) {
                Alert.alert(
                  "Unable to leave group",
                  error instanceof Error ? error.message : "Please try again.",
                );
              }
            },
          },
        ]);
      },
      testID: "group-detail-leave",
      variant: "destructive",
    });
  }
  if (group && viewer?.canDeleteGroup) {
    headerActions.push({
      label: "Delete group",
      onPress: () => {
        Alert.alert("Delete group", "This archives the group for members and discovery.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await groupActions.deleteGroup(group.id);
                router.replace("/(internal)/(tabs)/groups");
              } catch (error) {
                Alert.alert(
                  "Unable to delete group",
                  error instanceof Error ? error.message : "Please try again.",
                );
              }
            },
          },
        ]);
      },
      testID: "group-detail-delete",
      variant: "destructive",
    });
  }

  return (
    <DetailScaffold
      headerRight={
        headerActions.length > 0
          ? () => <DetailOverflowMenu actions={headerActions} testID="group-detail-overflow" />
          : undefined
      }
      isLoading={detailVm.isLoading}
      loadingLabel="Loading group..."
      notFound={detailVm.isError || !group}
      notFoundDescription="This group may be unavailable."
      notFoundTitle="Unable to load group"
      screenTestID="group-detail-screen"
    >
      {group ? (
        <>
          <View className="gap-4 rounded-3xl bg-card p-5">
            {groupCoverUrl ? (
              <Image
                accessibilityLabel={`${group.name} cover photo`}
                className="h-40 w-full rounded-2xl"
                resizeMode="cover"
                source={{ uri: groupCoverUrl }}
              />
            ) : null}
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 flex-row items-start gap-3">
                <Avatar alt={group.name} className="h-14 w-14">
                  {groupAvatarUrl ? <AvatarImage source={{ uri: groupAvatarUrl }} /> : null}
                  <AvatarFallback>
                    <Text className="text-base font-semibold text-foreground">
                      {groupInitials(group.name)}
                    </Text>
                  </AvatarFallback>
                </Avatar>
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-3xl font-semibold text-foreground" numberOfLines={3}>
                    {group.name}
                  </Text>
                  <Text className="text-sm text-muted-foreground">@{group.slug}</Text>
                </View>
              </View>
              {viewer ? (
                <GroupRelationshipBadge relationshipState={viewer.relationshipState} />
              ) : null}
            </View>

            <View className="flex-row items-end justify-between gap-3">
              <View className="flex-row flex-wrap gap-2">
                <GroupAccessLevelBadge accessLevel={group.access_level} />
                <GroupJoinPolicyBadge joinPolicy={group.join_policy} />
              </View>
              {viewer?.canViewMembers ? (
                <MemberAvatarStack
                  hasMore={detailVm.membersQuery.hasNextPage}
                  members={detailVm.members}
                  onPress={() =>
                    router.push({ pathname: "/group-members", params: { groupId: group.id } })
                  }
                />
              ) : null}
            </View>

            {group.description ? (
              <Text className="text-sm leading-6 text-muted-foreground">{group.description}</Text>
            ) : null}
          </View>

          <GroupPrimaryActionBar
            isLoading={isWorking}
            onJoin={() => groupActions.joinGroup(group.id)}
            onRequestToJoin={() => groupActions.requestToJoin(group.id)}
            viewer={viewer}
          />

          {!viewer?.canViewMembers && group.access_level === "members_only" ? (
            <GroupMembersOnlyLockedState
              onRequestAccess={
                viewer?.canRequestToJoin ? () => groupActions.requestToJoin(group.id) : undefined
              }
            />
          ) : null}

          {viewer?.canViewGroupEvents ? (
            <View className="gap-3">
              <View className="flex-row items-center justify-between gap-3">
                <GroupEventTabs onChange={setEventTab} value={eventTab} />
                {viewer.canCreateGroupEvent ? (
                  <Pressable
                    accessibilityRole="button"
                    className="rounded-full bg-primary px-4 py-2"
                    onPress={handleCreateEvent}
                    testID="group-detail-create-event"
                  >
                    <Text className="text-sm font-semibold text-primary-foreground">
                      Create event
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {detailVm.currentEventPlanOptionsQuery.isLoading ? null : detailVm
                  .currentEventPlanOptions?.event && eventTab === "upcoming" ? (
                <CurrentGroupEventPlanCard
                  event={detailVm.currentEventPlanOptions.event}
                  onPress={(event) => handleOpenEvent(event.id)}
                />
              ) : null}
              {visibleEventsVm.isLoading ? (
                <GroupEventListSkeleton count={2} />
              ) : visibleEvents.length > 0 ? (
                <View className="gap-3">
                  {visibleEvents.map((event) => (
                    <GroupEventCard
                      event={event}
                      key={event.id}
                      onPress={() => handleOpenEvent(event.id)}
                    />
                  ))}
                </View>
              ) : (
                <GroupEventEmptyState description={emptyDescription} title={emptyTitle} />
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </DetailScaffold>
  );
}
