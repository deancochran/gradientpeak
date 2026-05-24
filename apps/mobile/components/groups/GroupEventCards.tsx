import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { CalendarDays, MapPin } from "lucide-react-native";
import { type GestureResponderEvent, Pressable, TouchableOpacity, View } from "react-native";
import type { CurrentGroupEventPlan, GroupEventListItem } from "@/lib/groups";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

type GroupEventOwner = NonNullable<GroupEventListItem["group"]>;

type GroupEventCardProps = {
  event: GroupEventListItem;
  onGroupPress?: (group: GroupEventOwner) => void;
  onPress?: (event: GroupEventListItem) => void;
  testID?: string;
  variant?: "default" | "compact";
};

export function formatGroupEventDateRange(
  event: Pick<GroupEventListItem, "ends_at" | "starts_at">,
) {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  if (Number.isNaN(startsAt.getTime())) return "Date unavailable";

  const startLabel = format(startsAt, "EEE, MMM d · h:mm a");
  if (!endsAt || Number.isNaN(endsAt.getTime())) return startLabel;

  return `${startLabel} - ${format(endsAt, "h:mm a")}`;
}

export function formatAcceptedRsvpCount(count: number) {
  return `${count} going`;
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

export function GroupEventOwnerRow({
  group,
  onPress,
}: {
  group: GroupEventOwner;
  onPress?: (group: GroupEventOwner) => void;
}) {
  const displayName = group.name?.trim() || "Group";
  const avatarUrl = group.avatar_url ? getReachableSupabaseStorageUrl(group.avatar_url) : null;
  const content = (
    <>
      <Avatar alt={displayName} className="h-7 w-7">
        {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
        <AvatarFallback>
          <Text className="text-[10px] font-semibold text-muted-foreground">
            {groupInitials(displayName)}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
          {displayName}
        </Text>
        {group.slug ? (
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            @{group.slug}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    const handlePress = (event?: GestureResponderEvent) => {
      event?.stopPropagation?.();
      onPress(group);
    };

    return (
      <Pressable
        accessibilityHint="Opens the group detail page"
        accessibilityLabel={`Open group ${displayName}`}
        accessibilityRole="button"
        className="flex-row items-center gap-2 self-start rounded-full pr-2"
        onPress={handlePress}
      >
        {content}
      </Pressable>
    );
  }

  return <View className="flex-row items-center gap-2 self-start pr-2">{content}</View>;
}

export function GroupEventCard({
  event,
  onGroupPress,
  onPress,
  testID,
  variant = "default",
}: GroupEventCardProps) {
  const status = event.cancelled_at
    ? "Cancelled"
    : event.viewerRsvp?.status === "accepted"
      ? "Going"
      : event.viewerRsvp?.status === "declined"
        ? "Declined"
        : "Tentative";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!onPress}
      onPress={() => onPress?.(event)}
      testID={testID}
    >
      <View
        className={
          variant === "compact"
            ? "gap-2 rounded-xl border border-border bg-card p-3"
            : "gap-3 rounded-2xl border border-border bg-card p-4"
        }
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            {event.group ? <GroupEventOwnerRow group={event.group} onPress={onGroupPress} /> : null}
          </View>
          <View
            className={
              event.cancelled_at
                ? "rounded-full bg-destructive/10 px-2.5 py-1"
                : "rounded-full bg-primary/10 px-2.5 py-1"
            }
          >
            <Text
              className={
                event.cancelled_at
                  ? "text-xs font-semibold text-destructive"
                  : "text-xs font-semibold text-primary"
              }
            >
              {status}
            </Text>
          </View>
        </View>

        <View className="gap-1">
          <Text
            className={
              variant === "compact"
                ? "text-base font-semibold text-foreground"
                : "text-lg font-semibold text-foreground"
            }
            numberOfLines={2}
          >
            {event.title}
          </Text>
          <View className="flex-row items-center gap-2">
            <CalendarDays size={14} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {formatGroupEventDateRange(event)}
            </Text>
          </View>
        </View>

        {event.location_name ? (
          <View className="flex-row items-center gap-2">
            <MapPin size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {event.location_name}
            </Text>
          </View>
        ) : null}

        <Text className="text-xs font-medium text-muted-foreground">
          {formatAcceptedRsvpCount(event.acceptedRsvpCount)}
        </Text>

        {event.description && variant !== "compact" ? (
          <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={3}>
            {event.description}
          </Text>
        ) : null}

        {event.activityPlanOptions.length > 0 ? (
          <Text className="text-xs font-medium text-muted-foreground">
            {event.activityPlanOptions.length} activity plan option
            {event.activityPlanOptions.length === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function GroupEventPreviewHeader({
  canCreate,
  onCreate,
}: {
  canCreate?: boolean;
  onCreate?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-lg font-semibold text-foreground">Upcoming events</Text>
      </View>
      {canCreate ? (
        <Button onPress={onCreate} size="sm">
          <Text className="text-xs font-semibold text-primary-foreground">Create</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function CurrentGroupEventPlanCard({
  event,
  onGroupPress,
  onPress,
}: {
  event: CurrentGroupEventPlan;
  onGroupPress?: (group: GroupEventOwner) => void;
  onPress?: (event: CurrentGroupEventPlan) => void;
}) {
  const optionCount = event.activityPlanOptions.length;
  const hasActivityPlanOptions = optionCount > 0;

  return (
    <TouchableOpacity activeOpacity={0.85} disabled={!onPress} onPress={() => onPress?.(event)}>
      <View
        className={`gap-2 rounded-2xl border p-4 ${hasActivityPlanOptions ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
      >
        {event.group ? <GroupEventOwnerRow group={event.group} onPress={onGroupPress} /> : null}
        <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
          {hasActivityPlanOptions ? "Current / next plan" : "Current / next event"}
        </Text>
        <Text className="text-base font-semibold text-foreground" numberOfLines={2}>
          {event.title}
        </Text>
        <Text className="text-xs text-muted-foreground">{formatGroupEventDateRange(event)}</Text>
        {optionCount > 0 ? (
          <Text className="text-xs text-muted-foreground">
            {optionCount} plan option{optionCount === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
