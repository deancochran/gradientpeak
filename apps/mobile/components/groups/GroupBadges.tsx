import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import {
  formatGroupAccessLevel,
  formatGroupJoinPolicy,
  formatGroupMembershipRole,
  formatGroupRelationshipState,
  type GroupAccessLevel,
  type GroupJoinPolicy,
  type GroupMembershipRole,
  type GroupRelationshipState,
} from "@/lib/groups";

type BadgeTone = "default" | "primary" | "muted" | "warning" | "destructive";

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  testID?: string;
};

function badgeContainerClassName(tone: BadgeTone) {
  switch (tone) {
    case "primary":
      return "border-primary/20 bg-primary/10";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10";
    case "destructive":
      return "border-destructive/20 bg-destructive/10";
    case "muted":
      return "border-border bg-muted";
    case "default":
      return "border-border bg-card";
  }
}

function badgeTextClassName(tone: BadgeTone) {
  switch (tone) {
    case "primary":
      return "text-primary";
    case "warning":
      return "text-amber-700";
    case "destructive":
      return "text-destructive";
    case "muted":
      return "text-muted-foreground";
    case "default":
      return "text-foreground";
  }
}

export function GroupBadge({ label, tone = "default", testID }: BadgeProps) {
  return (
    <View
      className={`rounded-full border px-2.5 py-1 ${badgeContainerClassName(tone)}`}
      testID={testID}
    >
      <Text className={`text-xs font-medium ${badgeTextClassName(tone)}`}>{label}</Text>
    </View>
  );
}

export function GroupAccessLevelBadge({ accessLevel }: { accessLevel: GroupAccessLevel }) {
  return (
    <GroupBadge
      label={formatGroupAccessLevel(accessLevel)}
      tone={accessLevel === "members_only" ? "warning" : "primary"}
    />
  );
}

export function GroupJoinPolicyBadge({ joinPolicy }: { joinPolicy: GroupJoinPolicy }) {
  return (
    <GroupBadge
      label={formatGroupJoinPolicy(joinPolicy)}
      tone={joinPolicy === "open" ? "primary" : "muted"}
    />
  );
}

export function GroupMembershipRoleBadge({ role }: { role: GroupMembershipRole }) {
  return (
    <GroupBadge
      label={formatGroupMembershipRole(role)}
      tone={role === "owner" ? "primary" : role === "admin" ? "warning" : "muted"}
    />
  );
}

export function GroupRelationshipBadge({
  relationshipState,
}: {
  relationshipState: GroupRelationshipState;
}) {
  return (
    <GroupBadge
      label={formatGroupRelationshipState(relationshipState)}
      tone={
        relationshipState === "owner" ||
        relationshipState === "admin" ||
        relationshipState === "member"
          ? "primary"
          : relationshipState === "invited" || relationshipState === "requested"
            ? "warning"
            : relationshipState === "removed"
              ? "destructive"
              : "muted"
      }
    />
  );
}
