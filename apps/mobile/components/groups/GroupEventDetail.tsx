import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { type ActivityPlan, ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { api } from "@/lib/api";
import type { GroupEventDetail, GroupEventSeriesOccurrence } from "@/lib/groups";
import { formatGroupEventDateRange, GroupEventCard } from "./GroupEventCards";

export function GroupEventActivityPlanOptionsSection({
  event,
  onActivityPlanPress,
}: {
  event: GroupEventDetail;
  onActivityPlanPress?: (activityPlanId: string) => void;
}) {
  const activityPlanIds = event.activityPlanOptions.map((option) => option.activity_plan_id);
  const activityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    { ids: activityPlanIds },
    { enabled: activityPlanIds.length > 0 },
  );
  const activityPlansById = new Map(
    (activityPlansQuery.data?.items ?? []).map((plan) => [plan.id, plan]),
  );
  const missingCount = activityPlanIds.length - activityPlansById.size;

  if (event.activityPlanOptions.length === 0) return null;

  return (
    <View className="gap-2">
      <Text className="text-base font-semibold text-foreground">Activity plans</Text>
      {activityPlansQuery.isLoading ? (
        <Text className="text-sm text-muted-foreground">Loading activity plans...</Text>
      ) : null}
      {event.activityPlanOptions.map((option) => {
        const activityPlan = activityPlansById.get(option.activity_plan_id);
        if (!activityPlan) return null;

        return (
          <ActivityPlanCard
            activityPlan={activityPlan as unknown as ActivityPlan}
            key={option.id}
            onPress={() => onActivityPlanPress?.(activityPlan.id)}
            variant="compact"
          />
        );
      })}
      {!activityPlansQuery.isLoading && missingCount > 0 ? (
        <Text className="text-sm text-muted-foreground">
          {missingCount === activityPlanIds.length
            ? "Activity plans are not available to view."
            : `${missingCount} activity plan${missingCount === 1 ? " is" : "s are"} not available to view.`}
        </Text>
      ) : null}
    </View>
  );
}

export function GroupEventRsvpPanel({
  event,
  isSubmitting = false,
  onRsvp,
}: {
  event: GroupEventDetail;
  isSubmitting?: boolean;
  onRsvp?: (
    status: "accepted" | "declined",
    selectedGroupEventActivityPlanId?: string | null,
  ) => void;
}) {
  const selectedId = event.viewerRsvp?.selected_group_event_activity_plan_id ?? null;
  const status = event.viewerRsvp?.status ?? null;

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <Text className="text-base font-semibold text-foreground">
        RSVP{status ? ` · ${status === "accepted" ? "Going" : "Declined"}` : ""}
      </Text>
      {event.activityPlanOptions.length > 1 ? (
        <View className="gap-2">
          {event.activityPlanOptions.map((option, index) => (
            <Button
              key={option.id}
              disabled={isSubmitting || Boolean(event.cancelled_at)}
              onPress={() => onRsvp?.("accepted", option.id)}
              variant={selectedId === option.id && status === "accepted" ? "default" : "outline"}
            >
              <Text
                className={
                  selectedId === option.id && status === "accepted"
                    ? "text-sm font-semibold text-primary-foreground"
                    : "text-sm font-semibold text-foreground"
                }
              >
                {option.label?.trim() || `Activity plan ${index + 1}`}
              </Text>
            </Button>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <Button
          className="flex-1"
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => onRsvp?.("accepted", event.activityPlanOptions[0]?.id ?? null)}
          variant={status === "accepted" ? "default" : "outline"}
        >
          <Text
            className={
              status === "accepted"
                ? "text-sm font-semibold text-primary-foreground"
                : "text-sm font-semibold text-foreground"
            }
          >
            {isSubmitting ? "Saving..." : "Going"}
          </Text>
        </Button>
        <Button
          className="flex-1"
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => onRsvp?.("declined", null)}
          variant={status === "declined" ? "destructive" : "outline"}
        >
          <Text
            className={
              status === "declined"
                ? "text-sm font-semibold text-destructive-foreground"
                : "text-sm font-semibold text-foreground"
            }
          >
            Decline
          </Text>
        </Button>
      </View>
    </View>
  );
}

export function GroupEventSeriesRsvpPanel({
  event,
  isSubmitting = false,
  onRsvpSeries,
}: {
  event: GroupEventDetail;
  isSubmitting?: boolean;
  onRsvpSeries?: (status: "accepted" | "declined") => void;
}) {
  if (!event.is_recurring_series && !event.is_recurring_occurrence) return null;

  const status = event.viewerSeriesRsvp?.status ?? null;

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <Text className="text-base font-semibold text-foreground">
        Series RSVP{status ? ` · ${status === "accepted" ? "Going" : "Declined"}` : ""}
      </Text>
      <View className="flex-row gap-3">
        <Button
          className="flex-1"
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => onRsvpSeries?.("accepted")}
          variant={status === "accepted" ? "default" : "outline"}
        >
          <Text
            className={
              status === "accepted"
                ? "text-sm font-semibold text-primary-foreground"
                : "text-sm font-semibold text-foreground"
            }
          >
            {isSubmitting ? "Saving..." : "Going to series"}
          </Text>
        </Button>
        <Button
          className="flex-1"
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => onRsvpSeries?.("declined")}
          variant={status === "declined" ? "destructive" : "outline"}
        >
          <Text
            className={
              status === "declined"
                ? "text-sm font-semibold text-destructive-foreground"
                : "text-sm font-semibold text-foreground"
            }
          >
            Decline series
          </Text>
        </Button>
      </View>
    </View>
  );
}

export function GroupEventFutureOccurrencesSection({
  isLoading,
  occurrences,
  onOccurrencePress,
}: {
  isLoading?: boolean;
  occurrences: GroupEventSeriesOccurrence[];
  onOccurrencePress?: (event: GroupEventSeriesOccurrence) => void;
}) {
  if (isLoading) {
    return <Text className="text-sm text-muted-foreground">Loading future dates...</Text>;
  }

  if (occurrences.length === 0) {
    return <Text className="text-sm text-muted-foreground">No future dates.</Text>;
  }

  return (
    <View className="gap-2">
      <Text className="text-base font-semibold text-foreground">Future dates</Text>
      {occurrences.map((occurrence) => (
        <GroupEventCard event={occurrence} key={occurrence.id} onPress={onOccurrencePress} />
      ))}
    </View>
  );
}

export function GroupEventDetailScreen({
  canManage = false,
  event,
  futureOccurrences = [],
  isLoadingFutureOccurrences = false,
  isWorking = false,
  onActivityPlanPress,
  onCancel,
  onCopySeriesPlans,
  onEdit,
  onOccurrencePress,
  onRsvp,
  onRsvpSeries,
}: {
  canManage?: boolean;
  event: GroupEventDetail;
  futureOccurrences?: GroupEventSeriesOccurrence[];
  isLoadingFutureOccurrences?: boolean;
  isWorking?: boolean;
  onActivityPlanPress?: (activityPlanId: string) => void;
  onCancel?: () => void;
  onCopySeriesPlans?: () => void;
  onEdit?: () => void;
  onOccurrencePress?: (event: GroupEventSeriesOccurrence) => void;
  onRsvp?: (
    status: "accepted" | "declined",
    selectedGroupEventActivityPlanId?: string | null,
  ) => void;
  onRsvpSeries?: (status: "accepted" | "declined") => void;
}) {
  const recurrenceLabel = event.is_recurring_series
    ? "Recurring series"
    : event.is_recurring_occurrence
      ? "Series occurrence"
      : "One-time event";

  return (
    <View className="gap-4">
      <View className="gap-3 rounded-3xl bg-card p-5">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
            {recurrenceLabel}
          </Text>
          <Text className="text-3xl font-semibold text-foreground" numberOfLines={3}>
            {event.title}
          </Text>
          <Text className="text-sm text-muted-foreground">{formatGroupEventDateRange(event)}</Text>
        </View>
        {event.cancelled_at ? (
          <Text className="text-sm font-semibold text-destructive">This event is cancelled.</Text>
        ) : null}
        {event.location_name ? (
          <Text className="text-sm text-muted-foreground">{event.location_name}</Text>
        ) : null}
        {event.description?.trim() ? (
          <Text className="text-sm leading-6 text-muted-foreground">{event.description}</Text>
        ) : null}
        {canManage ? (
          <View className="gap-3">
            {event.is_recurring_occurrence && event.series_id ? (
              <Button disabled={isWorking} onPress={onCopySeriesPlans} variant="outline">
                <Text className="text-sm font-semibold text-foreground">
                  Copy series plans to occurrence
                </Text>
              </Button>
            ) : null}
            <View className="flex-row gap-3">
              <Button className="flex-1" disabled={isWorking} onPress={onEdit} variant="outline">
                <Text className="text-sm font-semibold text-foreground">Edit</Text>
              </Button>
              {!event.cancelled_at ? (
                <Button
                  className="flex-1"
                  disabled={isWorking}
                  onPress={onCancel}
                  variant="destructive"
                >
                  <Text className="text-sm font-semibold text-destructive-foreground">
                    Cancel event
                  </Text>
                </Button>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      <GroupEventSeriesRsvpPanel
        event={event}
        isSubmitting={isWorking}
        onRsvpSeries={onRsvpSeries}
      />
      {event.is_recurring_series || event.is_recurring_occurrence ? (
        <GroupEventFutureOccurrencesSection
          isLoading={isLoadingFutureOccurrences}
          occurrences={futureOccurrences}
          onOccurrencePress={onOccurrencePress}
        />
      ) : null}
      <GroupEventRsvpPanel event={event} isSubmitting={isWorking} onRsvp={onRsvp} />
      <GroupEventActivityPlanOptionsSection
        event={event}
        onActivityPlanPress={onActivityPlanPress}
      />
    </View>
  );
}
