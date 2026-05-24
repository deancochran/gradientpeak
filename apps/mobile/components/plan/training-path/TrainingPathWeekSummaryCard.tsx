import { Text } from "@repo/ui/components/text";
import { CalendarDays, Users } from "lucide-react-native";
import type React from "react";
import { ActivityIndicator, View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { CalendarEventCard } from "@/components/calendar/CalendarEventCard";
import { GroupEventCard } from "@/components/groups/GroupEventCards";
import { GoalListItem } from "@/components/plan/GoalListItem";
import { ActivityCard } from "@/components/shared/ActivityCard";
import type { ActivityPlanCardData } from "@/components/shared/ActivityPlanCard";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
import type { EntityOwner } from "@/components/shared/EntityOwnerRow";
import {
  ResourceCardShell,
  ResourceOwnerActionRow,
} from "@/components/shared/ResourceCardPrimitives";
import { getEventStatusLabel } from "@/lib/calendar/eventPresentation";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathWeekSummary,
} from "./trainingPathTypes";

type TrainingPathWeekSummaryCardProps = {
  summary: TrainingPathWeekSummary | null;
  goals: TrainingPathSelectedGoal[];
  events: TrainingPathScheduledItem[];
  groupEvents: TrainingPathScheduledItem[];
  completedActivities: TrainingPathCompletedActivity[];
  loading?: boolean;
  loadingDateLabel?: string;
  onOpenActivity: (activityId: string) => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGroup?: (groupId: string) => void;
  onOpenGroupEvent: (eventId: string) => void;
  onOpenScheduledEvent: (eventId: string) => void;
};

type ScheduledRecordPlanCardProps = {
  activity: ActivityPlanCardData;
  categoryLabel: string;
  onPress: () => void;
  owner?: EntityOwner | null;
  recordLabel: string;
  statusLabel?: string | null;
  timestamp?: string | null;
  type: "event" | "groupEvent";
  testID: string;
};

type PlanWithCardMetadata = NonNullable<CalendarEvent["activity_plan"]> & {
  created_at?: string | null;
  owner?: ActivityPlanCardData["owner"];
  updated_at?: string | null;
};

function formatLoad(value: number) {
  return `${Math.round(value)} TSS`;
}

function WeekReviewSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="gap-2">
      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function WeekReviewEmptyRow({ children }: { children: string }) {
  return <Text className="text-xs text-muted-foreground">{children}</Text>;
}

function RecordStatusPill({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-muted px-2.5 py-1">
      <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
    </View>
  );
}

function ScheduledRecordPlanCard({
  activity,
  categoryLabel,
  onPress,
  owner,
  recordLabel,
  statusLabel,
  timestamp,
  type,
  testID,
}: ScheduledRecordPlanCardProps) {
  return (
    <ResourceCardShell contentClassName="gap-3 px-3" onPress={onPress} testID={testID}>
      <ResourceOwnerActionRow
        actions={statusLabel ? <RecordStatusPill label={statusLabel} /> : null}
        categoryIcon={type === "groupEvent" ? Users : CalendarDays}
        categoryLabel={categoryLabel}
        owner={owner}
        systemName={recordLabel}
        timestamp={timestamp}
      />

      <ActivityPlanSummary
        activityCategory={activity.activityType}
        description={activity.description || activity.notes || null}
        estimatedDuration={activity.estimatedDuration}
        estimatedTss={activity.estimatedTss}
        intensityFactor={activity.intensityFactor}
        owner={activity.owner}
        routeName={activity.routeName}
        routeProvided={!!activity.routeId}
        showAttribution
        structure={activity.structure}
        title={activity.name}
        updatedAt={activity.updatedAt ?? activity.createdAt}
        variant="standalone"
      />

      <ActivityPlanContentPreview
        compact
        intensityFactor={activity.intensityFactor}
        plan={{
          authoritative_metrics: {
            estimated_duration: activity.estimatedDuration,
            estimated_tss: activity.estimatedTss,
            intensity_factor: activity.intensityFactor,
            estimated_distance: activity.estimatedDistance,
          },
          route: {
            distance: activity.estimatedDistance,
          },
          route_id: activity.routeId,
          structure: activity.structure,
        }}
        size="small"
        testIDPrefix={`${testID}-preview`}
        tss={activity.estimatedTss}
      />
    </ResourceCardShell>
  );
}

function getPlanMetadata(plan: CalendarEvent["activity_plan"]): PlanWithCardMetadata | null {
  return plan ? (plan as PlanWithCardMetadata) : null;
}

function getScheduledActivityPlanCardData(event: CalendarEvent): ActivityPlanCardData | null {
  const plan = getPlanMetadata(event.activity_plan);
  if (!plan?.id) {
    return null;
  }

  const metrics = plan.authoritative_metrics;

  return {
    id: plan.id,
    name: plan.name?.trim() || event.title?.trim() || "Scheduled activity",
    activityType: plan.activity_category || "other",
    description: plan.description ?? event.description ?? undefined,
    estimatedDistance: metrics?.estimated_distance ?? plan.estimated_distance ?? undefined,
    estimatedDuration: metrics?.estimated_duration ?? plan.estimated_duration ?? undefined,
    estimatedTss: metrics?.estimated_tss ?? plan.estimated_tss ?? undefined,
    intensityFactor: metrics?.intensity_factor ?? plan.intensity_factor ?? undefined,
    notes: plan.notes ?? event.notes ?? undefined,
    routeId: plan.route_id ?? undefined,
    scheduledDate: event.starts_at ?? event.scheduled_date ?? undefined,
    structure: plan.structure as ActivityPlanCardData["structure"],
    createdAt: plan.created_at ?? undefined,
    updatedAt: plan.updated_at ?? undefined,
    owner: plan.owner ?? null,
  };
}

function hasViewerGroupEventRsvp(event: CalendarGroupEvent) {
  return Boolean(event.viewerRsvp || event.viewerSeriesRsvp);
}

function getGroupEventActivityPlanCardData(event: CalendarGroupEvent): ActivityPlanCardData | null {
  const plan = hasViewerGroupEventRsvp(event) ? getPlanMetadata(event.selectedActivityPlan) : null;
  if (!plan?.id) {
    return null;
  }

  const metrics = plan.authoritative_metrics;

  return {
    id: plan.id,
    name:
      plan.name?.trim() ||
      event.selectedActivityPlanOptionLabel?.trim() ||
      event.title?.trim() ||
      "Group activity plan",
    activityType: plan.activity_category || "other",
    description: plan.description ?? undefined,
    estimatedDistance: metrics?.estimated_distance ?? plan.estimated_distance ?? undefined,
    estimatedDuration: metrics?.estimated_duration ?? plan.estimated_duration ?? undefined,
    estimatedTss: metrics?.estimated_tss ?? plan.estimated_tss ?? undefined,
    intensityFactor: metrics?.intensity_factor ?? plan.intensity_factor ?? undefined,
    notes: plan.notes ?? undefined,
    routeId: plan.route_id ?? undefined,
    scheduledDate: event.starts_at,
    structure: plan.structure as ActivityPlanCardData["structure"],
    createdAt: plan.created_at ?? undefined,
    updatedAt: plan.updated_at ?? undefined,
    owner: plan.owner ?? null,
  };
}

function getGroupEventStatusLabel(event: CalendarGroupEvent) {
  if (event.cancelled_at) return "Cancelled";
  if (event.viewerRsvp?.status === "accepted" || event.viewerSeriesRsvp?.status === "accepted") {
    return "Going";
  }
  if (event.viewerRsvp?.status === "tentative" || event.viewerSeriesRsvp?.status === "tentative") {
    return "Tentative";
  }
  return null;
}

function getGroupEventOwner(event: CalendarGroupEvent): EntityOwner | null {
  if (!event.group) {
    return null;
  }

  return {
    id: event.group.id,
    username: event.group.name,
    avatar_url: event.group.avatar_url,
  };
}

function WeekReviewStatusRows({ loading }: { loading?: boolean }) {
  return (
    <>
      <WeekReviewEmptyRow>{loading ? "Loading goals." : "No goals this week."}</WeekReviewEmptyRow>
      <WeekReviewEmptyRow>
        {loading ? "Loading events." : "No events this week."}
      </WeekReviewEmptyRow>
      <WeekReviewEmptyRow>
        {loading ? "Loading group events." : "No group events this week."}
      </WeekReviewEmptyRow>
      <WeekReviewEmptyRow>
        {loading ? "Loading activities." : "No activities this week."}
      </WeekReviewEmptyRow>
    </>
  );
}

function WeekReviewLoadingState({ dateLabel }: { dateLabel?: string }) {
  return (
    <View className="gap-4" testID="training-path-week-summary-loading">
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">Week Review</Text>
            <ActivityIndicator size="small" testID="training-path-week-summary-loading-indicator" />
          </View>
          {dateLabel ? (
            <Text className="text-xs font-medium text-muted-foreground" numberOfLines={1}>
              {dateLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <WeekReviewStatusRows loading />
    </View>
  );
}

export function TrainingPathWeekSummaryCard({
  summary,
  goals,
  events,
  groupEvents,
  completedActivities,
  loading = false,
  loadingDateLabel,
  onOpenActivity,
  onOpenGoal,
  onOpenGroup,
  onOpenGroupEvent,
  onOpenScheduledEvent,
}: TrainingPathWeekSummaryCardProps) {
  if (!summary) {
    return null;
  }

  if (loading) {
    return <WeekReviewLoadingState dateLabel={loadingDateLabel ?? summary.dateLabel} />;
  }

  return (
    <View className="gap-4" testID="training-path-week-summary">
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-foreground">Week Review</Text>
          <Text className="text-xs font-medium text-muted-foreground" numberOfLines={1}>
            {summary.dateLabel}
          </Text>
        </View>
        {summary.body ? (
          <Text className="text-xs leading-5 text-muted-foreground">{summary.body}</Text>
        ) : null}
      </View>
      {goals.length > 0 ? (
        <WeekReviewSection title="Goals this week">
          {goals.map((goal) => (
            <GoalListItem
              key={goal.id}
              goal={{
                id: goal.id,
                title: goal.label,
                target_date: goal.targetDate,
                activity_category: goal.activityCategory,
              }}
              readinessPercent={goal.readinessPercent}
              readinessTarget={goal.readinessTarget}
              status={goal.status ?? undefined}
              onPress={() => onOpenGoal(goal.id)}
              testID={`training-path-week-goal-${goal.id}`}
            />
          ))}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No goals this week.</WeekReviewEmptyRow>
      )}
      {events.length > 0 ? (
        <WeekReviewSection title="Events this week">
          {events.map((item) => {
            const activityPlanCardData = item.event
              ? getScheduledActivityPlanCardData(item.event)
              : null;

            if (item.event && activityPlanCardData) {
              return (
                <ScheduledRecordPlanCard
                  key={item.id}
                  activity={activityPlanCardData}
                  categoryLabel="Event"
                  onPress={() => item.event && onOpenScheduledEvent(item.event.id)}
                  owner={item.event.owner ?? null}
                  recordLabel={item.event.title?.trim() || item.title || "Scheduled event"}
                  statusLabel={getEventStatusLabel(item.event)}
                  timestamp={item.event.starts_at ?? item.event.scheduled_date ?? item.date}
                  testID={`training-path-week-event-activity-plan-${item.id}`}
                  type="event"
                />
              );
            }

            return item.event ? (
              <CalendarEventCard
                key={item.id}
                canStart={false}
                event={item.event}
                onPress={() => item.event && onOpenScheduledEvent(item.event.id)}
              />
            ) : (
              <View key={item.id} className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-xs font-medium text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {typeof item.estimatedLoad === "number"
                    ? formatLoad(item.estimatedLoad)
                    : item.date}
                </Text>
              </View>
            );
          })}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No events this week.</WeekReviewEmptyRow>
      )}
      {groupEvents.length > 0 ? (
        <WeekReviewSection title="Group events this week">
          {groupEvents.map((item) => {
            const activityPlanCardData = item.groupEvent
              ? getGroupEventActivityPlanCardData(item.groupEvent)
              : null;

            if (item.groupEvent && activityPlanCardData) {
              return (
                <ScheduledRecordPlanCard
                  key={item.id}
                  activity={activityPlanCardData}
                  categoryLabel="Group event"
                  onPress={() => item.groupEvent && onOpenGroupEvent(item.groupEvent.id)}
                  owner={getGroupEventOwner(item.groupEvent)}
                  recordLabel={
                    item.groupEvent.group?.name ?? item.groupEvent.title ?? "Group event"
                  }
                  statusLabel={getGroupEventStatusLabel(item.groupEvent)}
                  timestamp={item.groupEvent.starts_at}
                  testID={`training-path-week-group-event-activity-plan-${item.id}`}
                  type="groupEvent"
                />
              );
            }

            return item.groupEvent ? (
              <GroupEventCard
                key={item.id}
                event={item.groupEvent}
                onGroupPress={(group) => onOpenGroup?.(group.id)}
                onPress={() => item.groupEvent && onOpenGroupEvent(item.groupEvent.id)}
                testID={`training-path-week-group-event-${item.id}`}
                variant="compact"
              />
            ) : (
              <View key={item.id} className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-xs font-medium text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-xs text-muted-foreground">{item.date}</Text>
              </View>
            );
          })}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No group events this week.</WeekReviewEmptyRow>
      )}
      {completedActivities.length > 0 ? (
        <WeekReviewSection title="Activities this week">
          {completedActivities.map((activity) =>
            activity.activity ? (
              <ActivityCard
                key={activity.id}
                activity={activity.activity}
                dateMode="absolute"
                onPress={() => onOpenActivity(activity.id)}
                showLike
                testID={`training-path-week-activity-${activity.id}`}
                variant="list"
              />
            ) : (
              <View key={activity.id} className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-xs font-medium text-foreground" numberOfLines={1}>
                  {activity.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {typeof activity.load === "number" ? formatLoad(activity.load) : activity.date}
                </Text>
              </View>
            ),
          )}
        </WeekReviewSection>
      ) : (
        <WeekReviewEmptyRow>No activities this week.</WeekReviewEmptyRow>
      )}
    </View>
  );
}
