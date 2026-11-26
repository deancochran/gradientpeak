import { z } from "zod";
import { dateOnlySchema } from "../schemas/date-only";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";

export const planPeriodReviewPeriodSchema = z.enum(["day", "week", "month"]);
export const planPeriodReviewRequestSchema = z
  .object({ anchorDate: dateOnlySchema, period: planPeriodReviewPeriodSchema })
  .strict();
export type PlanPeriodReviewRequest = z.output<typeof planPeriodReviewRequestSchema>;

const loadStatusSchema = z.enum(["complete", "partial", "known_zero", "unavailable"]);
const amountSchema = z.number().finite().nonnegative().nullable();
const evidenceSchema = z
  .object({
    status: loadStatusSchema,
    value: amountSchema,
    knownSubtotal: z.number().finite().nonnegative().nullable().optional(),
  })
  .strict();
const rangeSchema = z
  .object({
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    inclusiveDayCount: z.number().int().positive().max(31),
  })
  .strict();

export const planPeriodReviewDailyFactSchema = z
  .object({
    date: dateOnlySchema,
    completedLoad: evidenceSchema,
    committedLoad: evidenceSchema,
    targetLoad: evidenceSchema,
    actualSessions: z.number().int().nonnegative(),
    plannedSessions: z.number().int().nonnegative(),
    actualCategoryCounts: z
      .record(z.string().min(1).max(80), z.number().int().positive())
      .default({}),
    plannedCategoryCounts: z
      .record(z.string().min(1).max(80), z.number().int().positive())
      .default({}),
    actualDurationSeconds: evidenceSchema,
    plannedDurationSeconds: evidenceSchema,
    actualIntensity: evidenceSchema,
    plannedIntensity: evidenceSchema,
  })
  .strict();

const aggregateSchema = z
  .object({
    status: loadStatusSchema,
    value: amountSchema,
    knownSubtotal: z.number().finite().nonnegative().nullable(),
  })
  .strict();
const quantitySchema = z
  .object({ status: loadStatusSchema, value: z.number().int().nonnegative().nullable() })
  .strict();
const sessionSummarySchema = quantitySchema
  .extend({
    categoryCounts: z
      .array(
        z
          .object({ category: z.string().min(1).max(80), count: z.number().int().positive() })
          .strict(),
      )
      .max(8),
  })
  .strict();
const summarySchema = z
  .object({
    sessions: sessionSummarySchema,
    load: aggregateSchema,
    durationSeconds: aggregateSchema,
    intensity: aggregateSchema,
  })
  .strict();
const stateValuesSchema = z
  .object({ fitness: z.number().finite(), fatigue: z.number().finite(), form: z.number().finite() })
  .strict();
const stateActualSchema = z
  .object({
    status: z.enum(["available", "unavailable"]),
    source: z.enum(["modeled_from_completed_load", "unavailable"]),
    start: stateValuesSchema.nullable(),
    end: stateValuesSchema.nullable(),
    delta: stateValuesSchema.nullable(),
  })
  .strict();
const stateScheduledSchema = z
  .object({
    status: z.enum(["available", "unavailable"]),
    source: z.enum(["modeled_from_scheduled_load", "unavailable"]),
    endpoint: stateValuesSchema.nullable(),
  })
  .strict();
const trainingStateSchema = z
  .object({ actual: stateActualSchema, scheduled: stateScheduledSchema })
  .strict();
export const planPeriodReviewStateFactSchema = z
  .object({
    date: dateOnlySchema,
    longTermLoad: z.number().finite(),
    recentLoad: z.number().finite(),
    loadBalance: z.number().finite(),
  })
  .strict();
const findingSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.enum([
        "historical_completed_load_below_target",
        "future_committed_load_below_target",
        "current_total_workload_below_target",
      ]),
      priority: z.literal(1),
      workload: z.number().nonnegative(),
      targetLoad: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.enum([
        "historical_completed_load_above_target",
        "future_committed_load_above_target",
        "current_total_workload_above_target",
      ]),
      priority: z.literal(1),
      workload: z.number().nonnegative(),
      targetLoad: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("coverage_limited"),
      priority: z.literal(2),
      sources: z
        .array(z.enum(["activities", "scheduledItems"]))
        .min(1)
        .max(2),
    })
    .strict(),
]);

export const planPeriodReviewSchema = z
  .object({
    contractVersion: z.literal("plan-period-review-v1"),
    request: planPeriodReviewRequestSchema,
    selectedPeriod: rangeSchema,
    comparisonPeriod: rangeSchema,
    actual: summarySchema,
    projected: summarySchema.extend({ targetLoad: aggregateSchema }),
    comparison: z
      .object({
        actual: summarySchema,
        projected: summarySchema.extend({ targetLoad: aggregateSchema }),
      })
      .strict(),
    trainingState: z
      .object({
        selected: trainingStateSchema,
        comparison: trainingStateSchema,
        fitnessHistory: z
          .object({
            status: z.enum(["current", "historical", "unavailable"]),
            maturity: z.enum(["establishing_baseline", "mature"]).nullable(),
          })
          .strict(),
      })
      .strict(),
    coverage: z
      .object({
        activities: z.enum(["complete", "partial", "unavailable"]),
        scheduledItems: z.enum(["complete", "partial", "unavailable"]),
      })
      .strict(),
    findings: z.array(findingSchema).max(3),
  })
  .strict();
export type PlanPeriodReview = z.infer<typeof planPeriodReviewSchema>;

function monthRange(anchorDate: string) {
  const startDate = `${anchorDate.slice(0, 7)}-01`;
  const next = new Date(`${startDate}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { startDate, endDate: addDaysDateOnlyUtc(next.toISOString().slice(0, 10), -1) };
}

/** Resolves local-calendar date keys; callers map instants to these keys using the profile planning timezone. */
export function resolvePlanPeriodReviewRanges(
  input: z.input<typeof planPeriodReviewRequestSchema>,
) {
  const request = planPeriodReviewRequestSchema.parse(input);
  const selected =
    request.period === "day"
      ? { startDate: request.anchorDate, endDate: request.anchorDate }
      : request.period === "week"
        ? (() => {
            const weekday = new Date(`${request.anchorDate}T00:00:00.000Z`).getUTCDay();
            const startDate = addDaysDateOnlyUtc(request.anchorDate, -((weekday + 6) % 7));
            return { startDate, endDate: addDaysDateOnlyUtc(startDate, 6) };
          })()
        : monthRange(request.anchorDate);
  const dayCount = diffDateOnlyUtcDays(selected.startDate, selected.endDate) + 1;
  const comparison =
    request.period === "month"
      ? monthRange(addDaysDateOnlyUtc(selected.startDate, -1))
      : {
          endDate: addDaysDateOnlyUtc(selected.startDate, -1),
          startDate: addDaysDateOnlyUtc(selected.startDate, -dayCount),
        };
  return {
    selected: { ...selected, inclusiveDayCount: dayCount },
    comparison: {
      ...comparison,
      inclusiveDayCount: diffDateOnlyUtcDays(comparison.startDate, comparison.endDate) + 1,
    },
    readRange: {
      startDate: comparison.startDate,
      endDate: selected.endDate,
      inclusiveDayCount: diffDateOnlyUtcDays(comparison.startDate, selected.endDate) + 1,
    },
  };
}

function aggregate(
  facts: readonly z.output<typeof planPeriodReviewDailyFactSchema>[],
  key:
    | "completedLoad"
    | "committedLoad"
    | "targetLoad"
    | "actualDurationSeconds"
    | "plannedDurationSeconds"
    | "actualIntensity"
    | "plannedIntensity",
) {
  const values = facts.map((fact) => fact[key]);
  const knownSubtotal = values.reduce(
    (total, entry) => total + (entry.value ?? entry.knownSubtotal ?? 0),
    0,
  );
  if (values.some((value) => value.status === "partial"))
    return { status: "partial" as const, value: null, knownSubtotal: knownSubtotal || null };
  if (values.some((value) => value.status === "unavailable" || value.value === null))
    return { status: "unavailable" as const, value: null, knownSubtotal: knownSubtotal || null };
  const value = values.reduce((total, entry) => total + (entry.value ?? 0), 0);
  return {
    status: value === 0 ? ("known_zero" as const) : ("complete" as const),
    value,
    knownSubtotal: null,
  };
}

function aggregateIntensity(
  facts: readonly z.output<typeof planPeriodReviewDailyFactSchema>[],
  intensityKey: "actualIntensity" | "plannedIntensity",
  durationKey: "actualDurationSeconds" | "plannedDurationSeconds",
) {
  const pairs = facts.map((fact) => ({
    intensity: fact[intensityKey],
    duration: fact[durationKey],
  }));
  if (
    pairs.some(
      ({ intensity, duration }) =>
        intensity.status === "unavailable" ||
        duration.status === "unavailable" ||
        intensity.value === null ||
        duration.value === null,
    )
  )
    return { status: "unavailable" as const, value: null, knownSubtotal: null };
  if (
    pairs.some(
      ({ intensity, duration }) => intensity.status === "partial" || duration.status === "partial",
    )
  )
    return { status: "partial" as const, value: null, knownSubtotal: null };
  const duration = pairs.reduce((total, pair) => total + (pair.duration.value ?? 0), 0);
  if (duration === 0) return { status: "known_zero" as const, value: 0, knownSubtotal: null };
  return {
    status: "complete" as const,
    value:
      pairs.reduce(
        (total, pair) => total + (pair.intensity.value ?? 0) * (pair.duration.value ?? 0),
        0,
      ) / duration,
    knownSubtotal: null,
  };
}

function stateValues(point: z.output<typeof planPeriodReviewStateFactSchema>) {
  return { fitness: point.longTermLoad, fatigue: point.recentLoad, form: point.loadBalance };
}
function stateForRange(input: {
  range: z.infer<typeof rangeSchema>;
  actual: readonly z.output<typeof planPeriodReviewStateFactSchema>[];
  scheduled: readonly z.output<typeof planPeriodReviewStateFactSchema>[];
  actualEvidenceAvailable: boolean;
  scheduledEvidenceAvailable: boolean;
}) {
  const actualPoints = input.actual
    .filter((point) => point.date >= input.range.startDate && point.date <= input.range.endDate)
    .sort((left, right) => left.date.localeCompare(right.date));
  const actualStart = actualPoints[0];
  const actualEnd = actualPoints.at(-1);
  const scheduledEnd = input.scheduled.find((point) => point.date === input.range.endDate);
  const start = actualStart ? stateValues(actualStart) : null;
  const end = actualEnd ? stateValues(actualEnd) : null;
  return {
    actual:
      input.actualEvidenceAvailable && start && end
        ? {
            status: "available" as const,
            source: "modeled_from_completed_load" as const,
            start,
            end,
            delta: {
              fitness: end.fitness - start.fitness,
              fatigue: end.fatigue - start.fatigue,
              form: end.form - start.form,
            },
          }
        : {
            status: "unavailable" as const,
            source: "unavailable" as const,
            start: null,
            end: null,
            delta: null,
          },
    scheduled:
      input.scheduledEvidenceAvailable && scheduledEnd
        ? {
            status: "available" as const,
            source: "modeled_from_scheduled_load" as const,
            endpoint: stateValues(scheduledEnd),
          }
        : { status: "unavailable" as const, source: "unavailable" as const, endpoint: null },
  };
}

function categoryCounts(
  facts: readonly z.output<typeof planPeriodReviewDailyFactSchema>[],
  key: "actualCategoryCounts" | "plannedCategoryCounts",
) {
  const counts = new Map<string, number>();
  for (const fact of facts)
    for (const [category, count] of Object.entries(fact[key]))
      counts.set(category, (counts.get(category) ?? 0) + count);
  const unknown = counts.get("unknown");
  const known = [...counts.entries()]
    .filter(([category]) => category !== "unknown")
    .sort(
      ([leftCategory, leftCount], [rightCategory, rightCount]) =>
        rightCount - leftCount || leftCategory.localeCompare(rightCategory),
    );
  return [
    ...(unknown ? [{ category: "unknown", count: unknown }] : []),
    ...known.slice(0, unknown ? 7 : 8).map(([category, count]) => ({ category, count })),
  ];
}

/** Pure, bounded reduction. Missing days are represented as unavailable rather than inferred as rest. */
export function buildPlanPeriodReview(input: {
  request: z.input<typeof planPeriodReviewRequestSchema>;
  dailyFacts: readonly z.input<typeof planPeriodReviewDailyFactSchema>[];
  coverage: {
    activities: "complete" | "partial" | "unavailable";
    scheduledItems: "complete" | "partial" | "unavailable";
  };
  selectedPeriodState: "historical" | "current" | "future" | "unavailable";
  todayDate: string | null;
  actualStateFacts: readonly z.input<typeof planPeriodReviewStateFactSchema>[];
  scheduledStateFacts: readonly z.input<typeof planPeriodReviewStateFactSchema>[];
  fitnessHistory: {
    status: "current" | "historical" | "unavailable";
    maturity: "establishing_baseline" | "mature" | null;
  };
}): PlanPeriodReview {
  const request = planPeriodReviewRequestSchema.parse(input.request);
  const ranges = resolvePlanPeriodReviewRanges(request);
  if (input.dailyFacts.length > ranges.readRange.inclusiveDayCount)
    throw new Error("Period review facts exceed the bounded read range");
  const facts = input.dailyFacts.map((fact) => planPeriodReviewDailyFactSchema.parse(fact));
  const byDate = new Map(facts.map((fact) => [fact.date, fact]));
  const unavailable = { status: "unavailable" as const, value: null, knownSubtotal: null };
  const unavailableDay = (date: string) => ({
    date,
    completedLoad: unavailable,
    committedLoad: unavailable,
    targetLoad: unavailable,
    actualSessions: 0,
    plannedSessions: 0,
    actualCategoryCounts: {},
    plannedCategoryCounts: {},
    actualDurationSeconds: unavailable,
    plannedDurationSeconds: unavailable,
    actualIntensity: unavailable,
    plannedIntensity: unavailable,
  });
  const rangeFacts = (range: z.infer<typeof rangeSchema>) => {
    const result: z.output<typeof planPeriodReviewDailyFactSchema>[] = [];
    for (let date = range.startDate; date <= range.endDate; date = addDaysDateOnlyUtc(date, 1))
      result.push(byDate.get(date) ?? unavailableDay(date));
    return result;
  };
  const selectedFacts = rangeFacts(ranges.selected);
  const todayDate = input.todayDate;
  const selectedActualFacts =
    input.selectedPeriodState === "future"
      ? []
      : input.selectedPeriodState === "current" && todayDate
        ? selectedFacts.filter((fact) => fact.date <= todayDate)
        : selectedFacts;
  const comparisonFacts = rangeFacts(ranges.comparison);
  const coverageFor = (
    source: "complete" | "partial" | "unavailable",
    range: readonly z.output<typeof planPeriodReviewDailyFactSchema>[],
    key: "completedLoad" | "committedLoad",
  ) =>
    source === "unavailable" || range.some((fact) => fact[key].status === "unavailable")
      ? ("unavailable" as const)
      : source === "partial" || range.some((fact) => fact[key].status === "partial")
        ? ("partial" as const)
        : ("complete" as const);
  const actualCoverage =
    selectedActualFacts.length === 0
      ? ("unavailable" as const)
      : coverageFor(input.coverage.activities, selectedActualFacts, "completedLoad");
  const plannedCoverage = coverageFor(
    input.coverage.scheduledItems,
    selectedFacts,
    "committedLoad",
  );
  const comparisonActualCoverage = coverageFor(
    input.coverage.activities,
    comparisonFacts,
    "completedLoad",
  );
  const comparisonPlannedCoverage = coverageFor(
    input.coverage.scheduledItems,
    comparisonFacts,
    "committedLoad",
  );
  const actualLoad =
    selectedActualFacts.length === 0
      ? { status: "unavailable" as const, value: null, knownSubtotal: null }
      : aggregate(selectedActualFacts, "completedLoad");
  const committedLoad = aggregate(selectedFacts, "committedLoad");
  const targetLoad = aggregate(selectedFacts, "targetLoad");
  const actualDuration =
    selectedActualFacts.length === 0
      ? { status: "unavailable" as const, value: null, knownSubtotal: null }
      : aggregate(selectedActualFacts, "actualDurationSeconds");
  const plannedDuration = aggregate(selectedFacts, "plannedDurationSeconds");
  const actualIntensity =
    selectedActualFacts.length === 0
      ? { status: "unavailable" as const, value: null, knownSubtotal: null }
      : aggregateIntensity(selectedActualFacts, "actualIntensity", "actualDurationSeconds");
  const plannedIntensity = aggregateIntensity(
    selectedFacts,
    "plannedIntensity",
    "plannedDurationSeconds",
  );
  const actualSessions = selectedActualFacts.reduce(
    (total, fact) => total + fact.actualSessions,
    0,
  );
  const plannedSessions = selectedFacts.reduce((total, fact) => total + fact.plannedSessions, 0);
  const comparisonActualLoad = aggregate(comparisonFacts, "completedLoad");
  const comparisonCommittedLoad = aggregate(comparisonFacts, "committedLoad");
  const comparisonTargetLoad = aggregate(comparisonFacts, "targetLoad");
  const comparisonActualDuration = aggregate(comparisonFacts, "actualDurationSeconds");
  const comparisonPlannedDuration = aggregate(comparisonFacts, "plannedDurationSeconds");
  const comparisonActualIntensity = aggregateIntensity(
    comparisonFacts,
    "actualIntensity",
    "actualDurationSeconds",
  );
  const comparisonPlannedIntensity = aggregateIntensity(
    comparisonFacts,
    "plannedIntensity",
    "plannedDurationSeconds",
  );
  const comparisonActualSessions = comparisonFacts.reduce(
    (total, fact) => total + fact.actualSessions,
    0,
  );
  const comparisonPlannedSessions = comparisonFacts.reduce(
    (total, fact) => total + fact.plannedSessions,
    0,
  );
  const findings: z.infer<typeof findingSchema>[] = [];
  const workload =
    input.selectedPeriodState === "historical"
      ? actualLoad
      : input.selectedPeriodState === "future"
        ? committedLoad
        : actualLoad.status === "complete" && committedLoad.status === "complete"
          ? {
              status: "complete" as const,
              value: (actualLoad.value ?? 0) + (committedLoad.value ?? 0),
            }
          : { status: "unavailable" as const, value: null };
  const materialDifference =
    workload.value !== null && targetLoad.value !== null
      ? Math.abs(workload.value - targetLoad.value) >= Math.max(5, targetLoad.value * 0.05)
      : false;
  if (
    workload.status === "complete" &&
    targetLoad.status === "complete" &&
    workload.value !== null &&
    targetLoad.value !== null &&
    materialDifference
  ) {
    const direction = workload.value < targetLoad.value ? "below" : "above";
    const prefix =
      input.selectedPeriodState === "historical"
        ? "historical_completed_load"
        : input.selectedPeriodState === "future"
          ? "future_committed_load"
          : "current_total_workload";
    findings.push({
      type: `${prefix}_${direction}_target`,
      priority: 1,
      workload: workload.value,
      targetLoad: targetLoad.value,
    } as z.infer<typeof findingSchema>);
  }
  const sources: Array<"activities" | "scheduledItems"> = [];
  if (actualCoverage !== "complete") sources.push("activities");
  if (plannedCoverage !== "complete") sources.push("scheduledItems");
  if (sources.length > 0) findings.push({ type: "coverage_limited", priority: 2, sources });
  return planPeriodReviewSchema.parse({
    contractVersion: "plan-period-review-v1",
    request,
    selectedPeriod: ranges.selected,
    comparisonPeriod: ranges.comparison,
    actual: {
      sessions: {
        status: actualCoverage,
        value: actualCoverage === "unavailable" ? null : actualSessions,
        categoryCounts: categoryCounts(selectedActualFacts, "actualCategoryCounts"),
      },
      load: actualLoad,
      durationSeconds: actualDuration,
      intensity: actualIntensity,
    },
    projected: {
      sessions: {
        status: plannedCoverage,
        value: plannedCoverage === "unavailable" ? null : plannedSessions,
        categoryCounts: categoryCounts(selectedFacts, "plannedCategoryCounts"),
      },
      load: committedLoad,
      targetLoad,
      durationSeconds: plannedDuration,
      intensity: plannedIntensity,
    },
    comparison: {
      actual: {
        sessions: {
          status: comparisonActualCoverage,
          value: comparisonActualCoverage === "unavailable" ? null : comparisonActualSessions,
          categoryCounts: categoryCounts(comparisonFacts, "actualCategoryCounts"),
        },
        load: comparisonActualLoad,
        durationSeconds: comparisonActualDuration,
        intensity: comparisonActualIntensity,
      },
      projected: {
        sessions: {
          status: comparisonPlannedCoverage,
          value: comparisonPlannedCoverage === "unavailable" ? null : comparisonPlannedSessions,
          categoryCounts: categoryCounts(comparisonFacts, "plannedCategoryCounts"),
        },
        load: comparisonCommittedLoad,
        targetLoad: comparisonTargetLoad,
        durationSeconds: comparisonPlannedDuration,
        intensity: comparisonPlannedIntensity,
      },
    },
    trainingState: {
      selected: stateForRange({
        range: ranges.selected,
        actual: input.actualStateFacts.map((fact) => planPeriodReviewStateFactSchema.parse(fact)),
        scheduled: input.scheduledStateFacts.map((fact) =>
          planPeriodReviewStateFactSchema.parse(fact),
        ),
        actualEvidenceAvailable: actualCoverage === "complete",
        scheduledEvidenceAvailable: plannedCoverage === "complete",
      }),
      comparison: stateForRange({
        range: ranges.comparison,
        actual: input.actualStateFacts.map((fact) => planPeriodReviewStateFactSchema.parse(fact)),
        scheduled: input.scheduledStateFacts.map((fact) =>
          planPeriodReviewStateFactSchema.parse(fact),
        ),
        actualEvidenceAvailable: comparisonActualCoverage === "complete",
        scheduledEvidenceAvailable: comparisonPlannedCoverage === "complete",
      }),
      fitnessHistory: input.fitnessHistory,
    },
    coverage: { activities: actualCoverage, scheduledItems: plannedCoverage },
    findings: findings.slice(0, 3),
  });
}
