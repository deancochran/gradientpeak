import {
  addDaysDateKey,
  getWeekStartDateKey,
  type PlanningLedger,
  type PlanningLedgerRequest,
  planningLedgerRequestSchema,
  planningLedgerSchema,
  resolvePlanPeriodReviewRanges,
} from "@repo/core";
import { getCalendarDateInIanaZone } from "@repo/core/calendar";
import {
  buildNormalizedIntensityDistribution,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
} from "@repo/core/load";
import {
  type PlanningRange,
  planningRangeRequestSchema,
  planningRangeSchema,
} from "../../contracts/planning-range";
import { type DrizzleQueryExecutor, withRepeatableReadSnapshot } from "../../db";
import { createEventReadRepository } from "../../infrastructure/repositories";
import { readSelectedGroupEventsForCalendar } from "../groups/groupEventViews";
import { buildPeriodTrainingComposition, trainingCompositionSchema } from "./periodReviewService";
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

export const planningLedgerResponseSchema = planningLedgerSchema
  .extend({ trainingComposition: trainingCompositionSchema })
  .strict();

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
            kind: "event" as const,
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
  const known = values.filter(
    (item): item is { status: LoadStatus; value: number } => item.value !== null,
  );
  if (known.length === 0) return { status: "unavailable" as const, value: null };
  const value = Math.round(known.reduce((sum, item) => sum + item.value, 0) * 10) / 10;
  if (
    known.length !== values.length ||
    values.some((item) => item.status === "partial" || item.status === "unavailable")
  ) {
    return { status: "partial" as const, value };
  }
  const status = values.every((item) => item.status === "known_zero") ? "known_zero" : "complete";
  return { status, value };
}

function aggregateCoverage(values: Array<{ status: LoadStatus; value: number | null }>) {
  if (values.length === 0) return { status: "unavailable" as const, value: null };
  const known = values.filter(
    (item): item is { status: LoadStatus; value: number } => item.value !== null,
  );
  if (known.length === 0) return { status: "unavailable" as const, value: null };
  const amount = Math.round(known.reduce((sum, item) => sum + item.value, 0) * 10) / 10;
  if (
    known.length !== values.length ||
    values.some((item) => item.status === "partial" || item.status === "unavailable")
  ) {
    return { status: "partial" as const, value: amount };
  }
  return {
    status: values.every((item) => item.status === "known_zero")
      ? ("known_zero" as const)
      : ("complete" as const),
    value: amount,
  };
}

function value(status: LoadStatus, amount: number | null) {
  if (status === "unavailable" || amount === null) {
    return { status: "unavailable" as const, value: null };
  }
  if (status === "partial") return { status, value: amount };
  if (status === "known_zero") return { status: "known_zero" as const, value: 0 };
  return { status: "complete" as const, value: amount };
}

function coverageValue(status: LoadStatus, amount: number | null) {
  if (status === "unavailable" || amount === null || !Number.isFinite(amount)) {
    return { status: "unavailable" as const, value: null };
  }
  if (status === "partial") return { status: "partial" as const, value: amount };
  if (status === "known_zero") return { status: "known_zero" as const, value: 0 };
  return { status: "complete" as const, value: amount };
}

function plannedValue(status: LoadStatus, amount: number | null) {
  if (status === "unavailable" || amount === null || !Number.isFinite(amount)) {
    return { status: "unavailable" as const, value: null };
  }
  if (status === "partial") return { status: "partial" as const, value: amount };
  if (status === "known_zero") return { status: "known_zero" as const, value: 0 };
  return { status: "complete" as const, value: amount };
}

function aggregateIntensity(input: {
  load: ReturnType<typeof aggregate>;
  duration: ReturnType<typeof aggregateCoverage>;
}) {
  if (input.load.value === null || input.duration.value === null || input.duration.value <= 0) {
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

function trainingStateSeriesRange(
  request: PlanningLedgerRequest,
  periodStart: string,
  periodEnd: string,
) {
  return request.period === "day"
    ? { startDate: addDaysDateKey(request.anchorDate, -6), endDate: request.anchorDate }
    : { startDate: periodStart, endDate: periodEnd };
}

function trainingStateSeries(projection: PlanTabProjection, startDate: string, endDate: string) {
  const actualByDate = new Map(
    projection.fitness.actual
      .filter((point) => point.date >= startDate && point.date <= endDate)
      .map((point) => [point.date, point]),
  );
  const plannedByDate = new Map(
    projection.fitness.scheduled
      .filter((point) => point.date >= startDate && point.date <= endDate)
      .map((point) => [point.date, point]),
  );
  return [...new Set([...actualByDate.keys(), ...plannedByDate.keys()])]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 31)
    .map((date) => {
      const actual = actualByDate.get(date);
      const planned = plannedByDate.get(date);
      const values = (point: NonNullable<typeof actual>) => ({
        fitness: point.longTermLoad,
        fatigue: point.recentLoad,
        form: point.loadBalance,
      });
      return {
        date,
        actual: actual ? values(actual) : null,
        planned: planned ? values(planned) : null,
      };
    });
}

function intensityDistributionSource(
  projection: PlanTabProjection,
  items: PlanTabProjection["ledgerItems"],
) {
  const sourceStatuses = [
    ...(items.some((item) => item.kind === "completed")
      ? [projection.sourceCoverage.activities?.status]
      : []),
    ...(items.some((item) => item.kind === "planned")
      ? [projection.sourceCoverage.scheduledItems?.status]
      : []),
  ];
  if (sourceStatuses.length === 0) {
    sourceStatuses.push(
      projection.sourceCoverage.activities?.status,
      projection.sourceCoverage.scheduledItems?.status,
    );
  }
  if (sourceStatuses.some((status) => status === undefined)) return "unavailable" as const;
  return sourceStatuses.some((status) => status === "partial")
    ? ("partial" as const)
    : ("complete" as const);
}

function intensityDistributionObservation(item: PlanTabProjection["ledgerItems"][number]) {
  if (
    item.intensityStatus === "unavailable" ||
    item.contributingDurationStatus === "unavailable" ||
    item.intensity === null ||
    item.contributingDurationSeconds === null
  ) {
    return { status: "unavailable" as const, intensity: null, durationSeconds: null };
  }
  if (item.contributingDurationSeconds === 0) {
    return { status: "known_zero" as const, intensity: null, durationSeconds: 0 };
  }
  return {
    status:
      item.intensityStatus === "partial" || item.contributingDurationStatus === "partial"
        ? ("partial" as const)
        : ("complete" as const),
    intensity: item.intensity,
    durationSeconds: item.contributingDurationSeconds,
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
      planned: summary
        ? plannedValue(summary.remainingLoadStatus, summary.remainingLoad)
        : plannedValue("unavailable", null),
      remaining: summary
        ? plannedValue(summary.remainingLoadStatus, summary.remainingLoad)
        : plannedValue("unavailable", null),
      effective: summary ? value(summary.status, summary.commonLoad) : unavailable,
      intensity: summary ? value(summary.status, summary.intensity) : unavailable,
      contributingDurationSeconds: summary
        ? coverageValue(summary.status, summary.contributingDurationSeconds)
        : unavailable,
    };
  });
  const aggregateField = (field: keyof Omit<(typeof breakdown)[number], "date">) =>
    aggregate(breakdown.map((day) => day[field]));
  const aggregatePlannedField = (field: "planned" | "remaining") =>
    breakdown.length === 0
      ? plannedValue("unavailable", null)
      : aggregate(breakdown.map((day) => day[field]));
  const aggregateCoverageField = (field: "contributingDurationSeconds") =>
    aggregateCoverage(breakdown.map((day) => day[field]));
  const periodLedgerItems = input.projection.ledgerItems.filter(
    (item) => item.date >= periodStart && item.date <= periodEnd,
  );
  const entries: PlanningLedger["entries"] = periodLedgerItems.map((item) => ({
    id: item.id,
    date: item.date,
    startsAt: null,
    kind: item.kind,
    title: item.title,
    status: item.kind === "completed" ? "Completed" : "Planned",
    load:
      item.kind === "planned"
        ? plannedValue(item.loadStatus, item.load)
        : value(item.loadStatus, item.load),
    intensity:
      item.kind === "planned"
        ? plannedValue(item.intensityStatus, item.intensity)
        : value(item.intensityStatus, item.intensity),
    contributingDurationSeconds: coverageValue(
      item.contributingDurationStatus,
      item.contributingDurationSeconds,
    ),
    navigation: {
      target: item.kind === "completed" ? ("activity" as const) : ("event" as const),
      id: item.id,
    },
  }));
  const dayScheduledLoadById = new Map(
    days.flatMap((day) =>
      day.scheduledItems.map(
        (item) => [item.id, { load: item.plannedLoad, status: item.plannedLoadStatus }] as const,
      ),
    ),
  );
  entries.push(
    ...(input.calendarFacts?.entries ?? [])
      .filter((entry) => !periodLedgerItems.some((item) => item.id === entry.id))
      .map((entry) => ({
        ...entry,
        load:
          entry.kind === "planned"
            ? plannedValue(
                dayScheduledLoadById.get(entry.id)?.status ?? "unavailable",
                dayScheduledLoadById.get(entry.id)?.load ?? null,
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
  const contributingDurationSeconds = aggregateCoverageField("contributingDurationSeconds");
  const stateSeriesRange = trainingStateSeriesRange(request, periodStart, periodEnd);
  const distributionItems = periodLedgerItems.slice(0, MAX_LEDGER_ENTRIES);
  const distributionSource = intensityDistributionSource(input.projection, distributionItems);

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
      planned: aggregatePlannedField("planned"),
      remaining: aggregatePlannedField("remaining"),
      effective: effectiveLoad,
    },
    intensity: aggregateIntensity({ load: effectiveLoad, duration: contributingDurationSeconds }),
    intensityDistribution: buildNormalizedIntensityDistribution({
      sourceStatus:
        distributionSource === "unavailable"
          ? distributionSource
          : periodLedgerItems.length > distributionItems.length
            ? "partial"
            : distributionSource,
      observations: distributionItems.map(intensityDistributionObservation),
    }),
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
      series: trainingStateSeries(
        input.projection,
        stateSeriesRange.startDate,
        stateSeriesRange.endDate,
      ),
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
  const reviewRanges = resolvePlanPeriodReviewRanges(request);
  const stateRange = trainingStateSeriesRange(request, periodStart, periodEnd);
  const dependencies = input.dependencies ?? defaultDependencies;
  const asOf = input.asOf ?? new Date();
  return withRepeatableReadSnapshot(input.db, async (tx) => {
    const projection = await dependencies.readProjection({
      db: tx,
      profileId: input.profileId,
      request: {
        startDate:
          stateRange.startDate < reviewRanges.readRange.startDate
            ? stateRange.startDate
            : reviewRanges.readRange.startDate,
        endDate:
          stateRange.endDate > reviewRanges.readRange.endDate
            ? stateRange.endDate
            : reviewRanges.readRange.endDate,
      },
      asOf,
      ...(input.projectionDependencies !== undefined
        ? { dependencies: input.projectionDependencies }
        : {}),
    });
    const calendarFacts = await dependencies.readCalendarFacts({
      db: tx,
      profileId: input.profileId,
      periodStart,
      periodEndExclusive: addDaysDateKey(periodEnd, 1),
      planningTimezone: projection.planningTimezone,
    });
    const ledger = buildPlanningLedger({ projection, request, calendarFacts });
    const selectedPeriodState =
      projection.today === null
        ? ("unavailable" as const)
        : periodStart > projection.today
          ? ("future" as const)
          : periodEnd < projection.today
            ? ("historical" as const)
            : ("current" as const);
    return planningLedgerResponseSchema.parse({
      ...ledger,
      trainingComposition: buildPeriodTrainingComposition({
        projection,
        ranges: reviewRanges,
        selectedPeriodState,
      }),
    });
  });
}

function planningRangeValue(status: LoadStatus, amount: number | null) {
  return value(status, amount);
}

export function buildPlanningRange(input: {
  projection: PlanTabProjection;
  ledger: PlanningLedger;
  startDate: string;
  endDate: string;
}): PlanningRange {
  const days: PlanningRange["days"] = [];
  for (let date = input.startDate; date <= input.endDate; date = addDaysDateKey(date, 1)) {
    const summary = input.projection.dayLoads[date];
    days.push({
      date,
      actual: summary
        ? planningRangeValue(summary.completedLoadStatus, summary.completedLoad)
        : planningRangeValue("unavailable", null),
      committed: summary
        ? plannedValue(summary.remainingLoadStatus, summary.remainingLoad)
        : plannedValue("unavailable", null),
      target: summary
        ? plannedValue(summary.recommendedLoadStatus, summary.recommendedLoad)
        : plannedValue("unavailable", null),
      effective: summary
        ? planningRangeValue(summary.status, summary.commonLoad)
        : planningRangeValue("unavailable", null),
    });
  }
  const byWeek = new Map<string, typeof days>();
  for (const day of days) {
    const weekStart = getWeekStartDateKey(day.date);
    const entries = byWeek.get(weekStart) ?? [];
    entries.push(day);
    byWeek.set(weekStart, entries);
  }
  const weeks = [...byWeek.entries()].map(([weekStartDate, entries]) => ({
    weekStartDate,
    actual: aggregate(entries.map((entry) => entry.actual)),
    committed: aggregate(entries.map((entry) => entry.committed)),
    target: aggregate(entries.map((entry) => entry.target)),
    effective: aggregate(entries.map((entry) => entry.effective)),
  }));
  return planningRangeSchema.parse({
    contractVersion: "planning-range-v1",
    startDate: input.startDate,
    endDate: input.endDate,
    planningTimezone: input.projection.planningTimezone ?? "UTC",
    asOf: input.projection.asOf,
    publishedRevision: input.projection.publishedRevision,
    algorithmVersion: input.projection.algorithmVersion,
    days,
    weeks,
    trajectories: {
      actual: input.projection.fitness.actual,
      committed: input.projection.fitness.scheduled,
      target: input.projection.fitness.recommended,
    },
    goals: input.projection.goalMarkers,
    calendarItems: input.ledger.entries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      startsAt: entry.startsAt,
      kind: entry.kind,
      title: entry.title,
      status: entry.status,
      load: entry.load,
      navigation: entry.navigation,
    })),
    coverage: {
      state:
        input.projection.publishedRevision !== null && input.projection.timeline !== null
          ? "available"
          : "unavailable",
      activities: input.projection.sourceCoverage.activities,
      scheduledItems: input.projection.sourceCoverage.scheduledItems,
      calendarEvents: input.ledger.sourceCoverage.calendarEvents,
      groupEvents: input.ledger.sourceCoverage.groupEvents,
      entriesTruncated: input.ledger.entriesTruncated,
    },
  });
}

/** One repeatable-read composition over calendar, completed work, goals, and the AthleteReadModel. */
export async function readPlanningRange(input: {
  db: ProjectionDb;
  profileId: string;
  request: { startDate: string; endDate: string };
  asOf?: Date;
  projectionDependencies?: PlanTabProjectionDependencies;
  dependencies?: PlanningLedgerDependencies;
}) {
  const request = planningRangeRequestSchema.parse(input.request);
  const dependencies = input.dependencies ?? defaultDependencies;
  const asOf = input.asOf ?? new Date();
  return withRepeatableReadSnapshot(input.db, async (tx) => {
    const projection = await dependencies.readProjection({
      db: tx,
      profileId: input.profileId,
      request,
      asOf,
      ...(input.projectionDependencies === undefined
        ? {}
        : { dependencies: input.projectionDependencies }),
    });
    const calendarFacts = await dependencies.readCalendarFacts({
      db: tx,
      profileId: input.profileId,
      periodStart: request.startDate,
      periodEndExclusive: addDaysDateKey(request.endDate, 1),
      planningTimezone: projection.planningTimezone,
    });
    const ledger = buildPlanningLedger({
      projection,
      request: { period: "day", anchorDate: request.startDate },
      calendarFacts,
    });
    // The range owns all requested days even though the legacy ledger's period
    // selector is used only to assemble its bounded, calendar-authoritative items.
    const rangeLedger = planningLedgerSchema.parse({
      ...ledger,
      periodStart: request.startDate,
      periodEnd: request.endDate,
      entries: ledger.entries.filter(
        (entry) => entry.date >= request.startDate && entry.date <= request.endDate,
      ),
      milestones: projection.goalMarkers.filter(
        (goal) => goal.targetDate >= request.startDate && goal.targetDate <= request.endDate,
      ),
    });
    return buildPlanningRange({
      projection,
      ledger: rangeLedger,
      startDate: request.startDate,
      endDate: request.endDate,
    });
  });
}
