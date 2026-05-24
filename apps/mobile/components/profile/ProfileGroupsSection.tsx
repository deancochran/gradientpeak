import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { View } from "react-native";
import { GroupCompactCard } from "@/components/groups/GroupCards";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

const COLLAPSED_GROUP_LIMIT = 3;
const COLLAPSED_QUERY_LIMIT = COLLAPSED_GROUP_LIMIT + 1;
const EXPANDED_QUERY_LIMIT = 100;

type ProfileGroupsSectionProps = {
  profileId: string;
  testID?: string;
};

export function ProfileGroupsSection({
  profileId,
  testID = "profile-groups-section",
}: ProfileGroupsSectionProps) {
  const navigateTo = useAppNavigate();
  const [showAll, setShowAll] = useState(false);
  const groupsQuery = api.groups.forProfile.useQuery(
    { profileId, limit: showAll ? EXPANDED_QUERY_LIMIT : COLLAPSED_QUERY_LIMIT },
    { enabled: profileId.length > 0 },
  );
  const groups = groupsQuery.data?.items ?? [];
  const visibleGroups = showAll ? groups : groups.slice(0, COLLAPSED_GROUP_LIMIT);
  const hasMoreGroups =
    groups.length > COLLAPSED_GROUP_LIMIT || Boolean(groupsQuery.data?.nextCursor);

  if (groupsQuery.isLoading || groupsQuery.isError || groups.length === 0) {
    return null;
  }

  return (
    <View className="gap-3" testID={testID}>
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Groups</Text>
        <Text className="text-sm text-muted-foreground">
          Groups this profile is part of are publicly visible through group moments.
        </Text>
      </View>

      <View className="gap-2">
        {visibleGroups.map((group) => (
          <GroupCompactCard
            group={group}
            key={group.id}
            onPress={() =>
              navigateTo({ pathname: "/group-detail", params: { groupId: group.id } } as any)
            }
            testID={`${testID}-group-${group.id}`}
          />
        ))}
      </View>

      {!showAll && hasMoreGroups ? (
        <Button
          onPress={() => setShowAll(true)}
          size="sm"
          variant="outline"
          testID={`${testID}-view-all`}
        >
          <Text className="text-sm font-semibold text-foreground">View all groups</Text>
        </Button>
      ) : null}
    </View>
  );
}
