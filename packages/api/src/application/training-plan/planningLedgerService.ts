import {
  addDaysDateKey,
  getWeekStartDateKey,
  type PlanningLedger,
  type PlanningLedgerRequest,
  planningLedgerRequestSchema,
  planningLedgerSchema,
} from "@repo/core";
import { getCalendarDateInIanaZone } from "@repo/core/calendar";
import { COMMON_RELATIVE_LOAD_MODEL, COMMON_RELATIVE_LOAD_VERSION } from "@repo/core/load";
import type { DrizzleQueryExecutor } from "../../db";
import { createEventReadRepository } from "../../infrastructure/repositories";
import { readSelectedGroupEventsForCalendar } from "../groups/groupEventViews";
import {
  type PlanTabProjection,
  type PlanTabProjectionDependencies,
  readPlanTabProjectionSnapshot,
} from "./planTabProjectionService";

type ProjectionDb = DrizzleQueryExecutor & {
  transaction: <T>(
    operation: (tx: DrizzleQueryExecutor) => Promise<T>,
    config?: { accessMode?: "read only" | "read write"; isolationLevel?: "repeatable read" },
  ) => Promise<T>;
};

const MAX_LEDGER_CALENDAR_ENTRIES = 500;
const MAX_LEDGER_ENTRIES = 500;

type CalendarLedgerEntry = {
  id: string;
  date: string;
  startsAt: string | null;
  kind: "planned" | "event" | "group_event";
  title: string;
  status: string;
  navigation: { target: "event" | "group_event"; id: string };
};

type CalendarLedgerFacts = {
  entries: CalendarLedgerEntry[];
  sourceCoverage: Pick<PlanningLedger["sourceCoverage"], "calendarEvents" | "groupEvents">;
};

export type PlanningLedgerDependencies = {
  readProjection: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    request: { startDate: string; endDate: string };
    asOf: Date;
    dependencies?: PlanTabProjectionDependencies;
  }) => Promise<PlanTabProjection>;
  readCalendarFacts: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    periodStart: string;
    periodEndExclusive: string;
    planningTimezone: string | null;
  }) => Promise<CalendarLedgerFacts>;
};

const defaultDependencies: PlanningLedgerDependencies = {
  readProjection: readPlanTabProjectionSnapshot,
  readCalendarFacts: async ({
    db,
    profileId,
    periodStart,
    periodEndExclusive,
    planningTimezone,
  }) => {
    const repository = createEventReadRepository(db);
    const [eventRows, selectedGroupEvents] = await Promise.all([
      repository.listOwnedEvents({
        profileId,
        limit: MAX_LEDGER_CALENDAR_ENTRIES + 1,
        includeAdhoc: true,
        dateFrom: periodStart,
        dateTo: periodEndExclusive,
        ...(planningTimezone ? { planningTimezone } : {}),
      }),
      readSelectedGroupEventsForCalendar({
        db: db as never,
        profileId,
        startDate: periodStart,
        endDateExclusive: periodEndExclusive,
        limit: MAX_LEDGER_CALENDAR_ENTRIES,
      }),
    ]);
    const eventTruncated = eventRows.length > MAX_LEDGER_CALENDAR_ENTRIES;
    const visibleEvents = eventRows.slice(0, MAX_LEDGER_CALENDAR_ENTRIES);
    const rangeEnd = addDaysDateKey(periodEndExclusive, -1);
    return {
      entries: [
        ...visibleEvents
          .filter((event) => event.status !== "cancelled")
          .map((event) => ({
            id: event.id,
            date:
              event.all_day || !planningTimezone
                ? event.scheduled_date
                : getCalendarDateInIanaZone(event.starts_at, planningTimezone),
            startsAt: event.starts_at,
            kind: event.event_type === "planned" ? ("planned" as const) : ("event" as const),
            title: event.title.trim() || "Calendar event",
            status: event.status,
            navigation: { target: "event" as const, id: event.id },
          })),
        ...selectedGroupEvents.items.map((event) => ({
          id: event.id,
          date: getCalendarDateInIanaZone(event.starts_at, event.timezone),
          startsAt: event.starts_at,
          kind: "group_event" as const,
          title: event.title,
          status: "scheduled",
          navigation: { target: "group_event" as const, id: event.id },
        })),
      ],
      sourceCoverage: {
        calendarEvents: {
          startDate: periodStart,
          endDate: rangeEnd,
          status: eventTruncated ? "partial" : "complete",
        },
        groupEvents: {
          startDate: periodStart,
          endDate: rangeEnd,
          status: selectedGroupEvents.truncated ? "partial" : "complete",
        },
      },
    };
  },
};

export function resolvePlanningLedgerPeriod(request: PlanningLedgerRequest) {
  if (request.period === "day") {
    return { periodStart: request.anchorDate, periodEnd: request.anchorDate };
  }
  if (request.period === "week") {
    const periodStart = getWeekStartDateKey(request.anchorDate);
    return { periodStart, periodEnd: addDaysDateKey(periodStart, 6) };
  }
  const periodStart = `${request.anchorDate.slice(0, 7)}-01`;
  const year = Number(request.anchorDate.slice(0, 4));
  const month = Number(request.anchorDate.slice(5, 7));
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { periodStart, periodEnd: addDaysDateKey(nextMonth, -1) };
}

type LoadStatus = PlanningLedger["load"]["completed"]["status"];

function aggregate(values: Array<{ status: LoadStatus; value: number | null }>) {
  if (values.length === 0) return { status: "unavailable" as const, value: null };
  if (values.some((item) => item.status === "unavailable")) {
    return { status: "unavailable" as const, value: null };
  }
  const known = values.filter(
    (item): item is { status: LoadStatus; value: number } => item.value !== null,
  );
  if (known.length !== values.length) return { status: "unavailable" as const, value: null };
  const value = Math.round(known.reduce((sum, item) => sum + item.value, 0) * 10) / 10;
  const status = values.some((item) => item.status === "partial")
    ? "partial"
    : value === 0
      ? "known_zero"
      : "complete";
  return { status, value };
}

function value(status: LoadStatus, amount: number | null) {
  if (amount === null) return { status: "unavailable" as const, value: null };
  if (status === "partial") return { status, value: amount };
  return { status: amount === 0 ? ("known_zero" as const) : ("complete" as const), value: amount };
}

function aggregateIntensity(input: {
  load: ReturnType<typeof aggregate>;
  duration: ReturnType<typeof aggregate>;
}) {
  if (
    input.load.value === null ||
    input.duration.value === null ||
    input.duration.value <= 0 ||
    input.load.status === "unavailable" ||
    input.duration.status === "unavailable"
  ) {
    return input.load.status === "known_zero" && input.duration.status === "known_zero"
      ? { status: "known_zero" as const, value: 0 }
      : { status: "unavailable" as const, value: null };
  }
  return {
    status:
      input.load.status === "partial" || input.duration.status === "partial"
        ? ("partial" as const)
        : ("complete" as const),
    value: Math.sqrt((input.load.value * 3600) / (100 * input.duration.value)),
  };
}

function stateValue(
  projection: PlanTabProjection,
  periodStart: string,
  periodEnd: string,
  field: "longTermLoad" | "recentLoad" | "loadBalance",
  source: "actual" | "scheduled_projection",
) {
  const points = projection.fitness[source === "actual" ? "actual" : "scheduled"].filter(
    (point) => point.date >= periodStart && point.date <= periodEnd,
  );
  const point = points.at(-1);
  if (!point) {
    return { status: "unavailable" as const, value: null, observedOn: null, source: null };
  }
  return {
    status: "available" as const,
    value: point[field],
    observedOn: point.date,
    source,
  };
}

export function buildPlanningLedger(input: {
  projection: PlanTabProjection;
  request: PlanningLedgerRequest;
  calendarFacts?: CalendarLedgerFacts;
}): PlanningLedger {
  const request = planningLedgerRequestSchema.parse(input.request);
  const { periodStart, periodEnd } = resolvePlanningLedgerPeriod(request);
  const days =
    input.projection.timeline?.days.filter(
      (day) => day.date >= periodStart && day.date <= periodEnd,
    ) ?? [];
  const breakdown = days.map((day) => {
    const summary = input.projection.dayLoads[day.date];
    const unavailable = value("unavailable", null);
    return {
      date: day.date,
      completed: summary ? value(summary.completedLoadStatus, summary.completedLoad) : unavailable,
      planned: summary ? value(summary.remainingLoadStatus, summary.remainingLoad) : unavailable,
      remaining: summary ? value(summary.remainingLoadStatus, summary.remainingLoad) : unavailable,
      effective: summary ? value(summary.status, summary.commonLoad) : unavailable,
      intensity: summary ? value(summary.status, summary.intensity) : unavailable,
      contributingDurationSeconds: summary
        ? value(summary.status, summary.contributingDurationSeconds)
        : unavailable,
    };
  });
  const aggregateField = (field: keyof Omit<(typeof breakdown)[number], "date">) =>
    aggregate(breakdown.map((day) => day[field]));
  const entries: PlanningLedger["entries"] = input.projection.ledgerItems.map((item) => ({
    id: item.id,
    date: item.date,
    startsAt: null,
    kind: item.kind,
    title: item.title,
    status: item.kind === "completed" ? "Completed" : "Planned",
    load: value(item.loadStatus, item.load),
    intensity: value(item.intensityStatus, item.intensity),
    contributingDurationSeconds: value(
      item.contributingDurationStatus,
      item.contributingDurationSeconds,
    ),
    navigation: {
      target: item.kind === "completed" ? ("activity" as const) : ("event" as const),
      id: item.id,
    },
  }));
  const dayScheduledLoadById = new Map(
    days.flatMap((day) => day.scheduledItems.map((item) => [item.id, item.plannedLoad] as const)),
  );
  entries.push(
    ...(input.calendarFacts?.entries ?? [])
      .filter((entry) => !input.projection.ledgerItems.some((item) => item.id === entry.id))
      .map((entry) => ({
        ...entry,
        load:
          entry.kind === "planned"
            ? value(
                dayScheduledLoadById.get(entry.id) == null ? "unavailable" : "complete",
                dayScheduledLoadById.get(entry.id) ?? null,
              )
            : value("unavailable", null),
        intensity: value("unavailable", null),
        contributingDurationSeconds: value("unavailable", null),
      })),
  );
  const milestones = input.projection.goalMarkers
    .filter((goal) => goal.targetDate >= periodStart && goal.targetDate <= periodEnd)
    .map((goal) => ({
      id: goal.id,
      date: goal.targetDate,
      label: goal.label,
      activityCategory: goal.activityCategory,
    }));
  entries.push(
    ...milestones.map((goal) => ({
      id: goal.id,
      date: goal.date,
      startsAt: null,
      kind: "goal" as const,
      title: goal.label,
      status: "Goal date",
      load: value("unavailable", null),
      intensity: value("unavailable", null),
      contributingDurationSeconds: value("unavailable", null),
      navigation: { target: "goal" as const, id: goal.id },
    })),
  );
  entries.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      (left.startsAt && right.startsAt
        ? Date.parse(left.startsAt) - Date.parse(right.startsAt)
        : left.startsAt
          ? 1
          : right.startsAt
            ? -1
            : 0) ||
      left.title.localeCompare(right.title),
  );

  const entriesTruncated = entries.length > MAX_LEDGER_ENTRIES;
  const boundedEntries = entries.slice(0, MAX_LEDGER_ENTRIES);
  const effectiveLoad = aggregateField("effective");
  const contributingDurationSeconds = aggregateField("contributingDurationSeconds");

  return planningLedgerSchema.parse({
    contractVersion: "planning-ledger-v3",
    period: request.period,
    anchorDate: request.anchorDate,
    periodStart,
    periodEnd,
    planningTimezone: input.projection.planningTimezone,
    asOf: input.projection.asOf,
    load: {
      completed: aggregateField("completed"),
      planned: aggregateField("planned"),
      remaining: aggregateField("remaining"),
      effective: effectiveLoad,
    },
    intensity: aggregateIntensity({ load: effectiveLoad, duration: contributingDurationSeconds }),
    contributingDurationSeconds,
    trainingState: {
      actual: {
        fitness: stateValue(input.projection, periodStart, periodEnd, "longTermLoad", "actual"),
        fatigue: stateValue(input.projection, periodStart, periodEnd, "recentLoad", "actual"),
      },
      planned: {
        fitness: stateValue(
          input.projection,
          periodStart,
          periodEnd,
          "longTermLoad",
          "scheduled_projection",
        ),
        fatigue: stateValue(
          input.projection,
          periodStart,
          periodEnd,
          "recentLoad",
          "scheduled_projection",
        ),
      },
    },
    dailyBreakdown: request.period === "day" ? [] : breakdown,
    entries: boundedEntries,
    entriesTruncated,
    milestones,
    sourceCoverage: {
      ...input.projection.sourceCoverage,
      calendarEvents: input.calendarFacts?.sourceCoverage.calendarEvents ?? null,
      groupEvents: input.calendarFacts?.sourceCoverage.groupEvents ?? null,
    },
    modelContext: {
      commonLoadModel: COMMON_RELATIVE_LOAD_MODEL,
      commonLoadVersion: COMMON_RELATIVE_LOAD_VERSION,
      publishedRevision: input.projection.publishedRevision,
      algorithmVersion: input.projection.algorithmVersion,
    },
  });
}

export async function readPlanningLedger(input: {
  db: ProjectionDb;
  profileId: string;
  request: PlanningLedgerRequest;
  asOf?: Date;
  projectionDependencies?: PlanTabProjectionDependencies;
  dependencies?: PlanningLedgerDependencies;
}) {
  const request = planningLedgerRequestSchema.parse(input.request);
  const { periodStart, periodEnd } = resolvePlanningLedgerPeriod(request);
  const dependencies = input.dependencies ?? defaultDependencies;
  const asOf = input.asOf ?? new Date();
  return input.db.transaction(
    async (tx) => {
      const projection = await dependencies.readProjection({
        db: tx,
        profileId: input.profileId,
        request: { startDate: periodStart, endDate: periodEnd },
        asOf,
        dependencies: input.projectionDependencies,
      });
      const calendarFacts = await dependencies.readCalendarFacts({
        db: tx,
        profileId: input.profileId,
        periodStart,
        periodEndExclusive: addDaysDateKey(periodEnd, 1),
        planningTimezone: projection.planningTimezone,
      });
      return buildPlanningLedger({ projection, request, calendarFacts });
    },
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}
