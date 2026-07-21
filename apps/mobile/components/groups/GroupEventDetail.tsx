import type { GroupEventRsvpStatus } from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { View } from "react-native";
import { type ActivityPlan, ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import type { GroupEventDetail, GroupEventSeriesOccurrence } from "@/lib/groups";
import {
  formatAcceptedRsvpCount,
  formatGroupEventDateRange,
  GroupEventCard,
  GroupEventOwnerRow,
} from "./GroupEventCards";

type GroupEventDetailWithActivityPlan = GroupEventDetail & {
  activity_plan?: ActivityPlan | null;
};

function formatRsvpStatus(status: GroupEventRsvpStatus | null) {
  if (status === "accepted") return "Going";
  if (status === "declined") return "Declined";
  return "Tentative";
}

export function GroupEventActivityPlanOptionsSection({
  event,
  onActivityPlanPress,
}: {
  event: GroupEventDetail;
  onActivityPlanPress?: (activityPlanId: string) => void;
}) {
  const activityPlanId = event.activity_plan_id;
  const activityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    { ids: activityPlanId ? [activityPlanId] : [] },
    {
      enabled: Boolean(
        activityPlanId && !(event as GroupEventDetailWithActivityPlan).activity_plan,
      ),
    },
  );
  const activityPlan =
    (event as GroupEventDetailWithActivityPlan).activity_plan ??
    activityPlansQuery.data?.items[0] ??
    null;

  if (!activityPlanId) return null;

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <View className="gap-0.5">
        <Text className="text-base font-semibold text-foreground">Workout plan</Text>
        <Text className="text-sm text-muted-foreground">
          Open the group event activity plan to review the work.
        </Text>
      </View>
      {activityPlansQuery.isLoading ? (
        <Text className="text-sm text-muted-foreground">Loading activity plan...</Text>
      ) : null}
      {activityPlan ? (
        <ActivityPlanCard
          activityPlan={activityPlan as unknown as ActivityPlan}
          onPress={() => onActivityPlanPress?.(activityPlan.id)}
          variant="compact"
        />
      ) : !activityPlansQuery.isLoading ? (
        <Text className="text-sm text-muted-foreground">
          Activity plan is not available to view.
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
  onRsvp?: (status: GroupEventRsvpStatus | null) => void;
}) {
  const status = event.viewerRsvp?.status ?? null;

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground">Your RSVP</Text>
          <Text className="text-sm text-muted-foreground">{formatRsvpStatus(status)}</Text>
        </View>
        {status ? (
          <Button
            disabled={isSubmitting || Boolean(event.cancelled_at)}
            onPress={() => onRsvp?.(null)}
            size="sm"
            variant="ghost"
          >
            <Text className="text-xs font-semibold text-muted-foreground">Clear</Text>
          </Button>
        ) : null}
      </View>
      <View className="flex-row gap-3">
        <Button
          className="flex-1"
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => onRsvp?.("tentative")}
          variant={status === "tentative" || !status ? "secondary" : "outline"}
        >
          <Text className="text-sm font-semibold text-foreground">Tentative</Text>
        </Button>
        <Button
          className="flex-1"
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => onRsvp?.("accepted")}
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
          onPress={() => onRsvp?.("declined")}
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
  onRsvpSeries?: (status: GroupEventRsvpStatus | null) => void;
}) {
  const [applyOpen, setApplyOpen] = useState(false);
  const status = event.viewerSeriesRsvp?.status ?? null;
  const eventStatus = event.viewerRsvp?.status ?? null;

  if (!event.is_recurring_series && !event.is_recurring_occurrence) return null;

  const handleSeriesRsvp = (nextStatus: GroupEventRsvpStatus | null) => {
    onRsvpSeries?.(nextStatus);
    setApplyOpen(false);
  };

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground">Repeating event</Text>
          <Text className="text-sm text-muted-foreground">
            Your RSVP is for this date{status ? ` · Series is ${formatRsvpStatus(status)}` : ""}.
          </Text>
        </View>
        <Button
          disabled={isSubmitting || Boolean(event.cancelled_at)}
          onPress={() => setApplyOpen(true)}
          size="sm"
          variant="outline"
        >
          <Text className="text-xs font-semibold text-foreground">Apply to series</Text>
        </Button>
      </View>

      {applyOpen ? (
        <AppFormModal
          description="Use your RSVP for every date in this recurring event."
          onClose={() => setApplyOpen(false)}
          testID="group-event-series-rsvp-modal"
          title="Apply RSVP to series"
        >
          <View className="gap-3">
            <Text className="text-sm text-muted-foreground">
              Current date: {formatRsvpStatus(eventStatus)}
            </Text>
            <Button
              disabled={isSubmitting || Boolean(event.cancelled_at)}
              onPress={() => handleSeriesRsvp("tentative")}
              variant={status === "tentative" || !status ? "secondary" : "outline"}
            >
              <Text className="text-sm font-semibold text-foreground">Tentative for series</Text>
            </Button>
            <Button
              disabled={isSubmitting || Boolean(event.cancelled_at)}
              onPress={() => handleSeriesRsvp("accepted")}
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
              disabled={isSubmitting || Boolean(event.cancelled_at)}
              onPress={() => handleSeriesRsvp("declined")}
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
            {status ? (
              <Button
                disabled={isSubmitting || Boolean(event.cancelled_at)}
                onPress={() => handleSeriesRsvp(null)}
                variant="ghost"
              >
                <Text className="text-sm font-semibold text-muted-foreground">
                  Clear series RSVP
                </Text>
              </Button>
            ) : null}
          </View>
        </AppFormModal>
      ) : null}
    </View>
  );
}

export function GroupEventFutureOccurrencesSection({
  errorDescription,
  isError,
  isLoading,
  isRetrying,
  occurrences,
  onGroupPress,
  onOccurrencePress,
  onRetry,
}: {
  errorDescription?: string;
  isError?: boolean;
  isLoading?: boolean;
  isRetrying?: boolean;
  occurrences: GroupEventSeriesOccurrence[];
  onGroupPress?: (group: NonNullable<GroupEventDetail["group"]>) => void;
  onOccurrencePress?: (event: GroupEventSeriesOccurrence) => void;
  onRetry?: () => void;
}) {
  if (isLoading) {
    return <Text className="text-sm text-muted-foreground">Loading future dates...</Text>;
  }

  if (isError) {
    return (
      <View className="gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
        <Text className="text-base font-semibold text-destructive">
          Unable to load future dates
        </Text>
        <Text className="text-sm text-muted-foreground">
          {errorDescription ?? "Please try again."}
        </Text>
        {onRetry ? (
          <Button disabled={isRetrying} onPress={onRetry} size="sm" variant="outline">
            <Text className="text-foreground">{isRetrying ? "Retrying" : "Try again"}</Text>
          </Button>
        ) : null}
      </View>
    );
  }

  if (occurrences.length === 0) {
    return <Text className="text-sm text-muted-foreground">No future dates.</Text>;
  }

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <Text className="text-base font-semibold text-foreground">Future dates</Text>
      {occurrences.map((occurrence) => (
        <GroupEventCard
          event={occurrence}
          key={occurrence.id}
          onGroupPress={onGroupPress}
          onPress={onOccurrencePress}
        />
      ))}
    </View>
  );
}

export function GroupEventDetailScreen({
  canManage = false,
  event,
  futureOccurrencesError,
  isErrorFutureOccurrences = false,
  futureOccurrences,
  isLoadingFutureOccurrences = false,
  isRetryingFutureOccurrences = false,
  isWorking = false,
  onActivityPlanPress,
  onCancel,
  onEdit,
  onGroupPress,
  onOccurrencePress,
  onRetryFutureOccurrences,
  onRsvp,
  onRsvpSeries,
}: {
  canManage?: boolean;
  event: GroupEventDetail;
  futureOccurrencesError?: string;
  isErrorFutureOccurrences?: boolean;
  futureOccurrences?: GroupEventSeriesOccurrence[];
  isLoadingFutureOccurrences?: boolean;
  isRetryingFutureOccurrences?: boolean;
  isWorking?: boolean;
  onActivityPlanPress?: (activityPlanId: string) => void;
  onCancel?: () => void;
  onEdit?: () => void;
  onGroupPress?: (group: NonNullable<GroupEventDetail["group"]>) => void;
  onOccurrencePress?: (event: GroupEventSeriesOccurrence) => void;
  onRetryFutureOccurrences?: () => void;
  onRsvp?: (status: GroupEventRsvpStatus | null) => void;
  onRsvpSeries?: (status: GroupEventRsvpStatus | null) => void;
}) {
  if (!event) return null;

  return (
    <View className="gap-4">
      <View className="gap-4 rounded-3xl bg-card p-5">
        <View className="gap-4">
          {event.group ? <GroupEventOwnerRow group={event.group} onPress={onGroupPress} /> : null}
          <View className="gap-2">
            {event.cancelled_at ? (
              <View className="self-start rounded-full bg-destructive/10 px-2.5 py-1">
                <Text className="text-xs font-semibold text-destructive">Cancelled</Text>
              </View>
            ) : null}
            <Text className="text-3xl font-semibold text-foreground" numberOfLines={3}>
              {event.title}
            </Text>
            {event.description?.trim() ? (
              <Text className="text-sm leading-6 text-muted-foreground">{event.description}</Text>
            ) : null}
          </View>
          <View className="flex-row items-end justify-between gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-sm font-medium text-foreground">
                {formatGroupEventDateRange(event)}
              </Text>
              {event.location_name ? (
                <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                  {event.location_name}
                </Text>
              ) : null}
            </View>
            <View className="shrink-0 rounded-full bg-muted px-3 py-1">
              <Text className="text-sm font-semibold text-muted-foreground">
                {formatAcceptedRsvpCount(event.acceptedRsvpCount)}
              </Text>
            </View>
          </View>
        </View>
        {canManage ? (
          <View className="gap-3">
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

      <GroupEventActivityPlanOptionsSection
        event={event}
        onActivityPlanPress={onActivityPlanPress}
      />
      <GroupEventRsvpPanel event={event} isSubmitting={isWorking} onRsvp={onRsvp} />
      <GroupEventSeriesRsvpPanel
        event={event}
        isSubmitting={isWorking}
        onRsvpSeries={onRsvpSeries}
      />
      {event.is_recurring_series || event.is_recurring_occurrence ? (
        <GroupEventFutureOccurrencesSection
          {...(futureOccurrencesError === undefined
            ? {}
            : { errorDescription: futureOccurrencesError })}
          isError={isErrorFutureOccurrences}
          isLoading={isLoadingFutureOccurrences}
          isRetrying={isRetryingFutureOccurrences}
          occurrences={(futureOccurrences ?? [])
            .filter((occurrence) => occurrence.id !== event.id)
            .sort((left, right) => left.starts_at.localeCompare(right.starts_at))}
          {...(onGroupPress === undefined ? {} : { onGroupPress })}
          {...(onOccurrencePress === undefined ? {} : { onOccurrencePress })}
          {...(onRetryFutureOccurrences === undefined ? {} : { onRetry: onRetryFutureOccurrences })}
        />
      ) : null}
    </View>
  );
}
