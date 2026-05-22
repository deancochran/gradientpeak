import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { CalendarDays, MapPin } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import type { CurrentGroupEventPlan, GroupEventListItem } from "@/lib/groups";

type GroupEventCardProps = {
  event: GroupEventListItem;
  onPress?: (event: GroupEventListItem) => void;
  testID?: string;
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

export function GroupEventCard({ event, onPress, testID }: GroupEventCardProps) {
  const status = event.cancelled_at
    ? "Cancelled"
    : event.viewerRsvp?.status === "accepted"
      ? "Going"
      : event.viewerRsvp?.status === "declined"
        ? "Declined"
        : "No RSVP";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={!onPress}
      onPress={() => onPress?.(event)}
      testID={testID}
    >
      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            {event.group ? (
              <Text
                className="text-xs font-semibold uppercase tracking-wide text-primary"
                numberOfLines={1}
              >
                {event.group.name}
              </Text>
            ) : null}
            <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>
              {event.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <CalendarDays size={14} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {formatGroupEventDateRange(event)}
              </Text>
            </View>
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

        {event.location_name ? (
          <View className="flex-row items-center gap-2">
            <MapPin size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {event.location_name}
            </Text>
          </View>
        ) : null}

        {event.description ? (
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
  onPress,
}: {
  event: CurrentGroupEventPlan;
  onPress?: (event: CurrentGroupEventPlan) => void;
}) {
  const optionCount = event.activityPlanOptions.length;

  return (
    <TouchableOpacity activeOpacity={0.85} disabled={!onPress} onPress={() => onPress?.(event)}>
      <View className="gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
          Current / next plan
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
