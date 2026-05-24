import { Button } from "@repo/ui/components/button";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { type DisplayGroupViewerState, getGroupPrimaryAction } from "@/lib/groups";

type GroupPrimaryActionBarProps = {
  isLoading?: boolean;
  onAcceptInvite?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
  onRequestToJoin?: () => void;
  viewer: DisplayGroupViewerState | null;
};

type GroupAdminActionRailProps = {
  onDelete?: () => void;
  onEdit?: () => void;
  onInvite?: () => void;
  onManageJoinRequests?: () => void;
  onManageMembers?: () => void;
  viewer: DisplayGroupViewerState | null;
};

export function GroupPrimaryActionBar({
  isLoading = false,
  onAcceptInvite,
  onJoin,
  onLeave,
  onRequestToJoin,
  viewer,
}: GroupPrimaryActionBarProps) {
  const action = getGroupPrimaryAction(viewer ?? undefined);

  if (!action) return null;

  const actionConfig = {
    acceptInvite: { label: "Accept invite", onPress: onAcceptInvite },
    join: { label: "Join group", onPress: onJoin },
    requestToJoin: { label: "Request access", onPress: onRequestToJoin },
    leave: { label: "Leave group", onPress: onLeave },
  }[action];

  if (!actionConfig.onPress) return null;

  return (
    <View className="rounded-2xl border border-border bg-card p-3">
      <LoadingButton
        disabled={isLoading}
        loading={isLoading}
        loadingLabel="Working..."
        onPress={actionConfig.onPress}
      >
        <Text className="text-sm font-semibold text-primary-foreground">{actionConfig.label}</Text>
      </LoadingButton>
    </View>
  );
}

export function GroupAdminActionRail({
  onDelete,
  onEdit,
  onInvite,
  onManageJoinRequests,
  onManageMembers,
  viewer,
}: GroupAdminActionRailProps) {
  if (
    !viewer?.canEditGroup &&
    !viewer?.canInvite &&
    !viewer?.canManageMembers &&
    !viewer?.canDeleteGroup
  ) {
    return null;
  }

  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Admin tools
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {viewer.canEditGroup ? <RailButton label="Edit" onPress={onEdit} /> : null}
        {viewer.canInvite ? <RailButton label="Invite" onPress={onInvite} /> : null}
        {viewer.canManageMembers ? <RailButton label="Members" onPress={onManageMembers} /> : null}
        {viewer.canManageJoinRequests ? (
          <RailButton label="Requests" onPress={onManageJoinRequests} />
        ) : null}
        {viewer.canDeleteGroup ? (
          <RailButton destructive label="Delete" onPress={onDelete} />
        ) : null}
      </View>
    </View>
  );
}

function RailButton({
  destructive = false,
  label,
  onPress,
}: {
  destructive?: boolean;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Button
      disabled={!onPress}
      onPress={onPress}
      size="sm"
      variant={destructive ? "destructive" : "secondary"}
    >
      <Text
        className={
          destructive
            ? "text-xs font-semibold text-destructive-foreground"
            : "text-xs font-semibold text-secondary-foreground"
        }
      >
        {label}
      </Text>
    </Button>
  );
}
