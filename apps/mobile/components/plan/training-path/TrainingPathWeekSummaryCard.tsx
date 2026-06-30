import { Text } from "@repo/ui/components/text";
import { CalendarDays, Users } from "lucide-react-native";
import { View } from "react-native";
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
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import {
  TrainingPathWeekReviewEmptyRow,
  TrainingPathWeekReviewSection,
  TrainingPathWeekReviewShell,
} from "./TrainingPathWeekReviewShell";
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

type TrainingPathSelectedDaySummaryCardProps = {
  completedActivities: TrainingPathCompletedActivity[];
  date: string | null;
  events: TrainingPathScheduledItem[];
  goals: TrainingPathSelectedGoal[];
  groupEvents: TrainingPathScheduledItem[];
  loading?: boolean;
  point: DailyTrainingAdjustmentPoint | null;
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

function formatSignedLoad(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "On target";
  return `${rounded > 0 ? "+" : ""}${rounded} TSS`;
}

function valueOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatDateLabel(dateKey: string | null) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
      <TrainingPathWeekReviewEmptyRow>
        {loading ? "Loading goals." : "No goals this week."}
      </TrainingPathWeekReviewEmptyRow>
      <TrainingPathWeekReviewEmptyRow>
        {loading ? "Loading events." : "No events this week."}
      </TrainingPathWeekReviewEmptyRow>
      <TrainingPathWeekReviewEmptyRow>
        {loading ? "Loading group events." : "No group events this week."}
      </TrainingPathWeekReviewEmptyRow>
      <TrainingPathWeekReviewEmptyRow>
        {loading ? "Loading activities." : "No activities this week."}
      </TrainingPathWeekReviewEmptyRow>
    </>
  );
}

function WeekReviewLoadingState({ dateLabel }: { dateLabel?: string }) {
  return (
    <TrainingPathWeekReviewShell
      dateLabel={dateLabel}
      loading
      loadingChildren={<WeekReviewStatusRows loading />}
      testID="training-path-week-summary"
    >
      <WeekReviewStatusRows loading />
    </TrainingPathWeekReviewShell>
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
    <TrainingPathWeekReviewShell body={summary.body} dateLabel={summary.dateLabel}>
      {goals.length > 0 ? (
        <TrainingPathWeekReviewSection title="Goals this week">
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
        </TrainingPathWeekReviewSection>
      ) : (
        <TrainingPathWeekReviewEmptyRow>No goals this week.</TrainingPathWeekReviewEmptyRow>
      )}
      {events.length > 0 ? (
        <TrainingPathWeekReviewSection title="Events this week">
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
        </TrainingPathWeekReviewSection>
      ) : (
        <TrainingPathWeekReviewEmptyRow>No events this week.</TrainingPathWeekReviewEmptyRow>
      )}
      {groupEvents.length > 0 ? (
        <TrainingPathWeekReviewSection title="Group events this week">
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
        </TrainingPathWeekReviewSection>
      ) : (
        <TrainingPathWeekReviewEmptyRow>No group events this week.</TrainingPathWeekReviewEmptyRow>
      )}
      {completedActivities.length > 0 ? (
        <TrainingPathWeekReviewSection title="Activities this week">
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
        </TrainingPathWeekReviewSection>
      ) : (
        <TrainingPathWeekReviewEmptyRow>No activities this week.</TrainingPathWeekReviewEmptyRow>
      )}
    </TrainingPathWeekReviewShell>
  );
}

export function TrainingPathSelectedDaySummaryCard({
  completedActivities,
  date,
  events,
  goals,
  groupEvents,
  loading = false,
  point,
  onOpenActivity,
  onOpenGoal,
  onOpenGroup,
  onOpenGroupEvent,
  onOpenScheduledEvent,
}: TrainingPathSelectedDaySummaryCardProps) {
  const target = valueOrZero(point?.targetLoadTss);
  const planned = valueOrZero(point?.plannedLoadTss);
  const tentative = valueOrZero(point?.tentativePlannedLoadTss);
  const completed = valueOrZero(point?.completedLoadTss);
  const actualOrScheduled = valueOrZero(point?.actualOrScheduledLoadTss);
  const delta = valueOrZero(point?.loadDeltaTss ?? actualOrScheduled - target);
  const hasContent =
    goals.length > 0 ||
    events.length > 0 ||
    groupEvents.length > 0 ||
    completedActivities.length > 0;

  if (loading) {
    return (
      <TrainingPathWeekReviewShell
        dateLabel={formatDateLabel(date)}
        loading
        loadingChildren={
          <TrainingPathWeekReviewEmptyRow>Loading selected day.</TrainingPathWeekReviewEmptyRow>
        }
        testID="training-path-selected-day-summary"
        title="Selected Day"
      >
        <TrainingPathWeekReviewEmptyRow>Loading selected day.</TrainingPathWeekReviewEmptyRow>
      </TrainingPathWeekReviewShell>
    );
  }

  return (
    <TrainingPathWeekReviewShell
      body="Recommended, planned, and completed work for the selected day."
      dateLabel={formatDateLabel(date)}
      testID="training-path-selected-day-summary"
      title="Selected Day"
    >
      <View className="gap-3 rounded-2xl bg-card px-3 py-3">
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
          <InlineDayMetric label="Recommended" value={formatLoad(target)} />
          <InlineDayMetric label="Planned" value={formatLoad(planned + tentative)} />
          <InlineDayMetric label="Completed" value={formatLoad(completed)} />
          <InlineDayMetric label="Delta" value={formatSignedLoad(delta)} />
          {point?.formTsb != null ? (
            <InlineDayMetric label="Form" value={point.formTsb.toFixed(1)} />
          ) : null}
          {point?.readinessScore != null ? (
            <InlineDayMetric
              label="Readiness"
              value={`${Math.round(point.readinessScore * 100)}%`}
            />
          ) : null}
        </View>
        {point?.annotations?.length ? (
          <View className="gap-1">
            {point.annotations.map((annotation) => (
              <Text
                className="text-xs text-muted-foreground"
                key={`${annotation.code}-${annotation.message ?? ""}`}
              >
                {annotation.message ?? annotation.code}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {goals.length > 0 ? (
        <TrainingPathWeekReviewSection title="Goals due this day">
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
              testID={`training-path-day-goal-${goal.id}`}
            />
          ))}
        </TrainingPathWeekReviewSection>
      ) : null}

      {events.length > 0 ? (
        <TrainingPathWeekReviewSection title="Planned this day">
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
                  testID={`training-path-day-event-activity-plan-${item.id}`}
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
        </TrainingPathWeekReviewSection>
      ) : null}

      {groupEvents.length > 0 ? (
        <TrainingPathWeekReviewSection title="Group events this day">
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
                  testID={`training-path-day-group-event-activity-plan-${item.id}`}
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
                testID={`training-path-day-group-event-${item.id}`}
                variant="compact"
              />
            ) : null;
          })}
        </TrainingPathWeekReviewSection>
      ) : null}

      {completedActivities.length > 0 ? (
        <TrainingPathWeekReviewSection title="Completed this day">
          {completedActivities.map((activity) =>
            activity.activity ? (
              <ActivityCard
                key={activity.id}
                activity={activity.activity}
                dateMode="absolute"
                onPress={() => onOpenActivity(activity.id)}
                showLike
                testID={`training-path-day-activity-${activity.id}`}
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
        </TrainingPathWeekReviewSection>
      ) : null}

      {!hasContent ? (
        <TrainingPathWeekReviewEmptyRow>
          No planned or completed work for this day.
        </TrainingPathWeekReviewEmptyRow>
      ) : null}
    </TrainingPathWeekReviewShell>
  );
}

function InlineDayMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text className="text-[10px] font-medium text-muted-foreground">{label}</Text>
      <Text className="text-xs font-semibold text-foreground">{value}</Text>
    </View>
  );
}
