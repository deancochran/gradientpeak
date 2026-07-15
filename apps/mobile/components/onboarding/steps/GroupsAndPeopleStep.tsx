import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { SearchField } from "@repo/ui/components/search-field";
import { Text } from "@repo/ui/components/text";
import { useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GroupCard } from "@/components/groups/GroupCards";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { api } from "@/lib/api";
import type { GroupSummary, MyGroupInvitation } from "@/lib/groups";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { ONBOARDING_SOCIAL_SELECTION_LIMIT } from "@/lib/onboarding/onboarding-recovery";
import type { OnboardingGroupAction, StepProps } from "../types";

type SocialProfile = inferRouterOutputs<AppRouter>["social"]["searchUsers"]["users"][number];

const SUGGESTION_LIMIT = 5;

function LoadMoreButton({
  hasNextPage,
  isFetchingNextPage,
  onPress,
  testID,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onPress: () => void;
  testID: string;
}) {
  if (!hasNextPage) return null;

  return (
    <Button
      disabled={isFetchingNextPage}
      onPress={onPress}
      size="sm"
      testID={testID}
      variant="ghost"
    >
      {isFetchingNextPage ? <ActivityIndicator accessibilityLabel="Loading more" /> : null}
      <Text>{isFetchingNextPage ? "Loading…" : "Load more"}</Text>
    </Button>
  );
}

function SocialSectionState({
  empty,
  error,
  loading,
  onRetry,
  testID,
}: {
  empty: boolean;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  testID: string;
}) {
  if (loading) {
    return (
      <ActivityIndicator accessibilityLabel="Loading suggestions" testID={`${testID}-loading`} />
    );
  }
  if (error) {
    return (
      <View className="items-start gap-2" testID={`${testID}-error`}>
        <Text className="text-sm text-destructive">Could not load this section.</Text>
        <Button onPress={onRetry} size="sm" testID={`${testID}-retry`} variant="outline">
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }
  if (empty) {
    return (
      <Text className="text-sm text-muted-foreground" testID={`${testID}-empty`}>
        No matches found.
      </Text>
    );
  }
  return null;
}

export function GroupsAndPeopleStep({ data, updateData }: StepProps) {
  const [groupSearch, setGroupSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Record<string, GroupSummary>>({});
  const [selectedPeople, setSelectedPeople] = useState<Record<string, SocialProfile>>({});
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(null);
  const debouncedGroupSearch = useDebouncedValue(groupSearch.trim(), 300);
  const debouncedPeopleSearch = useDebouncedValue(peopleSearch.trim(), 300);

  const invitationsQuery = api.groups.myInvitations.useInfiniteQuery(
    { limit: SUGGESTION_LIMIT },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const groupsQuery = api.groups.listDiscoverable.useInfiniteQuery(
    {
      limit: SUGGESTION_LIMIT,
      search: debouncedGroupSearch || undefined,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const peopleQuery = api.social.searchUsers.useInfiniteQuery(
    {
      limit: SUGGESTION_LIMIT,
      query: debouncedPeopleSearch || undefined,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const invitationItems = useMemo(
    () => invitationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [invitationsQuery.data?.pages],
  );

  const groupItems = useMemo(() => {
    const items = groupsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const byId = new Map(items.map((group) => [group.id, group]));
    for (const groupId of data.selected_group_ids) {
      const selected = selectedGroups[groupId];
      if (selected) byId.set(selected.id, selected);
    }
    return [...byId.values()];
  }, [data.selected_group_ids, groupsQuery.data?.pages, selectedGroups]);

  const peopleItems = useMemo(() => {
    const items = peopleQuery.data?.pages.flatMap((page) => page.users) ?? [];
    const byId = new Map(items.map((profile) => [profile.id, profile]));
    for (const profileId of data.selected_follow_profile_ids) {
      const selected = selectedPeople[profileId];
      if (selected) byId.set(selected.id, selected);
    }
    return [...byId.values()];
  }, [data.selected_follow_profile_ids, peopleQuery.data?.pages, selectedPeople]);

  const toggleInvitation = (invitation: MyGroupInvitation) => {
    const selected = data.selected_invitation_ids.includes(invitation.id);
    if (!selected && data.selected_invitation_ids.length >= ONBOARDING_SOCIAL_SELECTION_LIMIT) {
      setSelectionFeedback(`Choose up to ${ONBOARDING_SOCIAL_SELECTION_LIMIT} invitations.`);
      return;
    }
    setSelectionFeedback(null);
    updateData({
      selected_invitation_ids: selected
        ? data.selected_invitation_ids.filter((id) => id !== invitation.id)
        : [...data.selected_invitation_ids, invitation.id],
      social_action_statuses: {
        ...data.social_action_statuses,
        [`invite:${invitation.id}`]: "pending",
      },
    });
  };

  const toggleGroup = (group: GroupSummary) => {
    const existing = data.selected_group_actions.find((item) => item.group_id === group.id);
    if (existing) {
      setSelectionFeedback(null);
      updateData({
        selected_group_ids: data.selected_group_ids.filter((id) => id !== group.id),
        selected_group_actions: data.selected_group_actions.filter(
          (item) => item.group_id !== group.id,
        ),
      });
      return;
    }
    if (data.selected_group_ids.length >= ONBOARDING_SOCIAL_SELECTION_LIMIT) {
      setSelectionFeedback(`Choose up to ${ONBOARDING_SOCIAL_SELECTION_LIMIT} groups.`);
      return;
    }
    setSelectionFeedback(null);
    const action: OnboardingGroupAction["action"] = group.viewer.canJoin ? "join" : "request";
    const next: OnboardingGroupAction = {
      action,
      action_key: `group:${group.id}`,
      group_id: group.id,
    };
    setSelectedGroups((previous) => ({ ...previous, [group.id]: group }));
    updateData({
      selected_group_ids: [...data.selected_group_ids, group.id],
      selected_group_actions: [...data.selected_group_actions, next],
      social_action_statuses: { ...data.social_action_statuses, [next.action_key]: "pending" },
    });
  };

  const togglePerson = (profile: SocialProfile) => {
    const selected = data.selected_follow_profile_ids.includes(profile.id);
    if (!selected && data.selected_follow_profile_ids.length >= ONBOARDING_SOCIAL_SELECTION_LIMIT) {
      setSelectionFeedback(`Choose up to ${ONBOARDING_SOCIAL_SELECTION_LIMIT} people.`);
      return;
    }
    setSelectionFeedback(null);
    setSelectedPeople((previous) => ({ ...previous, [profile.id]: profile }));
    updateData({
      selected_follow_profile_ids: selected
        ? data.selected_follow_profile_ids.filter((id) => id !== profile.id)
        : [...data.selected_follow_profile_ids, profile.id],
      social_action_statuses: {
        ...data.social_action_statuses,
        [`follow:${profile.id}`]: "pending",
      },
    });
  };

  return (
    <View className="gap-7" testID="groups-people-step">
      <View className="gap-2">
        <Text className="text-xl font-semibold text-foreground">Find your community</Text>
        <Text className="text-sm text-muted-foreground">
          Choose invitations, groups, and people now. Nothing is sent until you finish setup.
        </Text>
        {selectionFeedback ? (
          <Text className="text-sm text-destructive" testID="onboarding-social-selection-limit">
            {selectionFeedback}
          </Text>
        ) : null}
      </View>

      <View className="gap-3" testID="onboarding-invitations-section">
        <Text className="text-lg font-semibold text-foreground">Pending invitations</Text>
        <SocialSectionState
          empty={invitationItems.length === 0}
          error={invitationsQuery.isError}
          loading={invitationsQuery.isLoading}
          onRetry={() => void invitationsQuery.refetch()}
          testID="onboarding-invitations"
        />
        {invitationItems.map((invitation) => (
          <View className="gap-1" key={invitation.id}>
            <Text className="text-xs font-medium text-amber-700">Invitation to join</Text>
            <GroupCard
              group={invitation.group}
              onPress={() => toggleInvitation(invitation)}
              selected={data.selected_invitation_ids.includes(invitation.id)}
              testID={`onboarding-invitation-${invitation.id}`}
            />
          </View>
        ))}
        <LoadMoreButton
          hasNextPage={Boolean(invitationsQuery.hasNextPage)}
          isFetchingNextPage={invitationsQuery.isFetchingNextPage}
          onPress={() => void invitationsQuery.fetchNextPage()}
          testID="onboarding-invitations-load-more"
        />
      </View>

      <View className="gap-3" testID="onboarding-groups-section">
        <Text className="text-lg font-semibold text-foreground">Groups</Text>
        <SearchField
          accessibilityLabel="Search groups"
          loading={groupsQuery.isFetching}
          loadingLabel="Loading groups"
          onValueChange={setGroupSearch}
          placeholder="Search groups"
          testId="onboarding-groups-search"
          value={groupSearch}
        />
        <SocialSectionState
          empty={groupItems.length === 0}
          error={groupsQuery.isError}
          loading={groupsQuery.isLoading}
          onRetry={() => void groupsQuery.refetch()}
          testID="onboarding-groups"
        />
        {groupItems.map((group) => {
          const selected = data.selected_group_ids.includes(group.id);
          const canSelect = group.viewer.canJoin || group.viewer.canRequestToJoin;
          return (
            <GroupCard
              disabled={!canSelect}
              group={group}
              key={group.id}
              onPress={canSelect ? () => toggleGroup(group) : undefined}
              selected={selected}
              testID={`onboarding-group-${group.id}`}
              viewer={group.viewer}
            />
          );
        })}
        <LoadMoreButton
          hasNextPage={Boolean(groupsQuery.hasNextPage)}
          isFetchingNextPage={groupsQuery.isFetchingNextPage}
          onPress={() => void groupsQuery.fetchNextPage()}
          testID="onboarding-groups-load-more"
        />
      </View>

      <View className="gap-3" testID="onboarding-people-section">
        <Text className="text-lg font-semibold text-foreground">People</Text>
        <SearchField
          accessibilityLabel="Search people"
          loading={peopleQuery.isFetching}
          loadingLabel="Loading people"
          onValueChange={setPeopleSearch}
          placeholder="Search people"
          testId="onboarding-people-search"
          value={peopleSearch}
        />
        <SocialSectionState
          empty={peopleItems.length === 0}
          error={peopleQuery.isError}
          loading={peopleQuery.isLoading}
          onRetry={() => void peopleQuery.refetch()}
          testID="onboarding-people"
        />
        {peopleItems.map((profile) => {
          const selected = data.selected_follow_profile_ids.includes(profile.id);
          const disabled =
            profile.follow_status === "accepted" || profile.follow_status === "pending";
          return (
            <ProfileCard
              disabled={disabled}
              key={profile.id}
              onPress={disabled ? undefined : () => togglePerson(profile)}
              profile={profile}
              selected={selected}
              supportingText={
                profile.follow_status === "accepted"
                  ? "Following"
                  : profile.follow_status === "pending"
                    ? "Follow request pending"
                    : "Select to follow"
              }
              testID={`onboarding-profile-${profile.id}`}
            />
          );
        })}
        <LoadMoreButton
          hasNextPage={Boolean(peopleQuery.hasNextPage)}
          isFetchingNextPage={peopleQuery.isFetchingNextPage}
          onPress={() => void peopleQuery.fetchNextPage()}
          testID="onboarding-people-load-more"
        />
      </View>
    </View>
  );
}
