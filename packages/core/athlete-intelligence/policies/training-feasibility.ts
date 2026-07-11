import { z } from "zod";

import {
  type CalculationResult,
  calculationResultSchema,
  estimatedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import { sourceIdSchema } from "../lineage";

export const TRAINING_FEASIBILITY_POLICY_VERSION = "training-feasibility-v1" as const;

const daySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const nullableNonnegative = z.number().finite().nonnegative().nullable();
const capSchema = z
  .object({
    maximumWeeklyMinutes: nullableNonnegative,
    maximumSessionsPerWeek: z.number().int().nonnegative().nullable(),
    maximumSessionDurationMinutes: nullableNonnegative,
  })
  .strict();

export const trainingFeasibilityInputSchema = z
  .object({
    sourceId: sourceIdSchema,
    assessmentAsOf: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64).nullable(),
    planningStart: z.string().datetime({ offset: true }).nullable(),
    goalDate: z.string().date().nullable(),
    availabilityWindows: z.array(
      z
        .object({
          day: daySchema,
          startMinuteLocal: z.number().int().min(0).max(1439),
          endMinuteLocal: z.number().int().min(1).max(1440),
        })
        .strict()
        .refine((window) => window.endMinuteLocal > window.startMinuteLocal),
    ),
    hardRestDays: z.array(daySchema),
    maximumWeeklyMinutes: nullableNonnegative,
    maximumWeeklySessions: z.number().int().nonnegative().nullable(),
    maximumDailyMinutes: nullableNonnegative,
    maximumSessionsPerDay: z.number().int().positive().nullable(),
    maximumSessionDurationMinutes: nullableNonnegative,
    allowDoubleDays: z.boolean().nullable(),
    sportOverrides: z.array(z.object({ sport: z.string().min(1), caps: capSchema }).strict()),
    recoveryPreference: z.enum(["more", "balanced", "less"]).nullable(),
    requiredWeeklyMinutes: nullableNonnegative,
    requiredWeeklySessions: z.number().int().nonnegative().nullable(),
    plannedSchedule: z.array(
      z
        .object({
          sourceId: sourceIdSchema,
          startAt: z.string().datetime({ offset: true }),
          endAt: z.string().datetime({ offset: true }),
          lifecycle: z.enum(["planned", "confirmed", "completed", "cancelled"]),
          eventType: z.enum(["training", "race", "rest", "other"]),
          sport: z.string().min(1).nullable(),
        })
        .strict()
        .refine((event) => Date.parse(event.endAt) >= Date.parse(event.startAt)),
    ),
  })
  .strict();

const constraintResultsSchema = z
  .object({
    hardRestConflicts: calculationResultSchema,
    dailyDurationExcesses: calculationResultSchema,
    dailySessionCapExcesses: calculationResultSchema,
    doubleDayConflicts: calculationResultSchema,
    sessionDurationExcesses: calculationResultSchema,
    weeklyDurationExcesses: calculationResultSchema,
    weeklySessionCapExcesses: calculationResultSchema,
    sportOverrideExcesses: calculationResultSchema,
    recoveryPreferenceConflicts: calculationResultSchema,
  })
  .strict();

export const trainingFeasibilityResultsSchema = z
  .object({
    policyVersion: z.literal(TRAINING_FEASIBILITY_POLICY_VERSION),
    timeCoverage: calculationResultSchema,
    requiredSessionCoverage: calculationResultSchema,
    compatibleScheduledMinutes: calculationResultSchema,
    scheduleCoverage: calculationResultSchema,
    constraints: constraintResultsSchema,
  })
  .strict();

export type TrainingFeasibilityInput = z.infer<typeof trainingFeasibilityInputSchema>;
export type TrainingFeasibilityResults = z.infer<typeof trainingFeasibilityResultsSchema>;
type SourceId = z.infer<typeof sourceIdSchema>;

const dayNames = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function unavailable(reason: string, sourceId: SourceId, unsupported = false): CalculationResult {
  return unavailableResult({
    state: unsupported ? "unsupported" : "insufficient_evidence",
    missingDataState: unsupported ? "unsupported_input" : "required_data_missing",
    uncertainty: 1,
    reasonCodes: [reason],
    contributingSourceIds: [sourceId],
  });
}

function result(
  estimate: number,
  unit: string,
  reason: string,
  sourceIds: [SourceId, ...SourceId[]],
): CalculationResult {
  return estimatedResult({
    estimate: Math.max(0, estimate),
    unit,
    // Calendar feasibility cannot know whether stated availability remains usable.
    uncertainty: 0.15,
    reasonCodes: [reason],
    contributingSourceIds: sourceIds,
  });
}

function formatter(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }
}

function localParts(date: Date, format: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(
    format
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    minute: (parts.hour ?? 0) * 60 + (parts.minute ?? 0),
  };
}

function localDateKey(date: Date, format: Intl.DateTimeFormat): string {
  const parts = localParts(date, format);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function nextDateKey(key: string): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dayName(key: string): (typeof dayNames)[number] {
  return dayNames[new Date(`${key}T12:00:00Z`).getUTCDay()] ?? "sunday";
}

function mergedWindowMinutes(
  windows: TrainingFeasibilityInput["availabilityWindows"],
  day: (typeof dayNames)[number],
  lowerBound: number,
): number {
  const sorted = windows
    .filter((window) => window.day === day)
    .map(
      (window) => [Math.max(lowerBound, window.startMinuteLocal), window.endMinuteLocal] as const,
    )
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let start = -1;
  let end = -1;
  for (const window of sorted) {
    if (window[0] > end) {
      if (end > start) total += end - start;
      [start, end] = window;
    } else {
      end = Math.max(end, window[1]);
    }
  }
  return total + (end > start ? end - start : 0);
}

function isWithinAvailability(
  date: Date,
  format: Intl.DateTimeFormat,
  windows: TrainingFeasibilityInput["availabilityWindows"],
): boolean {
  const key = localDateKey(date, format);
  const minute = localParts(date, format).minute;
  return windows.some(
    (window) =>
      window.day === dayName(key) &&
      minute >= window.startMinuteLocal &&
      minute < window.endMinuteLocal,
  );
}

/** Evaluates stated calendar and resource capacity; it makes no physiological inference. */
export function calculateTrainingFeasibility(
  raw: TrainingFeasibilityInput,
): TrainingFeasibilityResults {
  const input = trainingFeasibilityInputSchema.parse(raw);
  const source = input.sourceId;
  const timezoneFormat = input.timezone ? formatter(input.timezone) : null;
  const start = input.planningStart ? new Date(input.planningStart) : null;
  const startKey = start && timezoneFormat ? localDateKey(start, timezoneFormat) : null;
  const validHorizon =
    start !== null && startKey !== null && input.goalDate !== null && input.goalDate >= startKey;
  const timezoneUnavailable = !timezoneFormat;

  const activeEvents = validHorizon
    ? input.plannedSchedule.filter(
        (event) =>
          (event.lifecycle === "planned" || event.lifecycle === "confirmed") &&
          event.eventType === "training" &&
          new Date(event.endAt) > (start as Date) &&
          localDateKey(new Date(event.startAt), timezoneFormat as Intl.DateTimeFormat) <=
            (input.goalDate as string),
      )
    : [];
  const sources = [source, ...activeEvents.map((event) => event.sourceId)] as [
    SourceId,
    ...SourceId[],
  ];

  let availableMinutes = 0;
  let horizonDays = 0;
  if (validHorizon && start && startKey && input.goalDate && timezoneFormat) {
    for (let key = startKey; key <= input.goalDate; key = nextDateKey(key)) {
      horizonDays += 1;
      const name = dayName(key);
      if (input.hardRestDays.includes(name)) continue;
      const lowerBound = key === startKey ? localParts(start, timezoneFormat).minute : 0;
      availableMinutes += mergedWindowMinutes(input.availabilityWindows, name, lowerBound);
    }
  }

  const clippedDuration = (event: (typeof activeEvents)[number]) => {
    const eventStart = Math.max(Date.parse(event.startAt), (start as Date).getTime());
    // Events beginning on the goal date are retained, but never contribute beyond that local date.
    const rawEnd = new Date(event.endAt);
    let eventEnd = rawEnd.getTime();
    if (timezoneFormat && input.goalDate) {
      while (localDateKey(new Date(eventEnd - 1), timezoneFormat) > input.goalDate)
        eventEnd -= 60_000;
    }
    return Math.max(0, (eventEnd - eventStart) / 60_000);
  };
  const compatibleScheduledMinutes = activeEvents.reduce((total, event) => {
    let cursor = Math.max(Date.parse(event.startAt), (start as Date).getTime());
    const end = cursor + clippedDuration(event) * 60_000;
    let compatibleMilliseconds = 0;
    while (cursor < end) {
      const nextMinuteBoundary = Math.floor(cursor / 60_000) * 60_000 + 60_000;
      const segmentEnd = Math.min(end, nextMinuteBoundary);
      if (
        isWithinAvailability(
          new Date(cursor),
          timezoneFormat as Intl.DateTimeFormat,
          input.availabilityWindows,
        )
      ) {
        compatibleMilliseconds += segmentEnd - cursor;
      }
      cursor = segmentEnd;
    }
    return total + compatibleMilliseconds / 60_000;
  }, 0);
  const demandedMinutes =
    validHorizon && input.requiredWeeklyMinutes !== null
      ? input.requiredWeeklyMinutes * (horizonDays / 7)
      : null;
  const demandedSessions =
    validHorizon && input.requiredWeeklySessions !== null
      ? input.requiredWeeklySessions * (horizonDays / 7)
      : null;
  const coverage = (
    numerator: number,
    demand: number | null,
    missingReason: string,
    reason: string,
  ) => {
    if (timezoneUnavailable) return unavailable("timezone_missing_or_unsupported", source, true);
    if (!validHorizon) return unavailable("goal_or_planning_horizon_missing", source);
    if (demand === null) return unavailable(missingReason, source);
    return result(demand === 0 ? 1 : Math.min(1, numerator / demand), "ratio", reason, sources);
  };

  const byDay = new Map<string, typeof activeEvents>();
  const byWeek = new Map<string, typeof activeEvents>();
  for (const event of activeEvents) {
    const effectiveStart = new Date(Math.max(Date.parse(event.startAt), (start as Date).getTime()));
    const key = localDateKey(effectiveStart, timezoneFormat as Intl.DateTimeFormat);
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const week = date.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
    byWeek.set(week, [...(byWeek.get(week) ?? []), event]);
  }
  const countDays = (predicate: (events: typeof activeEvents) => boolean) =>
    [...byDay.values()].filter(predicate).length;
  const capResult = (cap: number | boolean | null, value: number, reason: string) =>
    timezoneUnavailable
      ? unavailable("timezone_missing_or_unsupported", source, true)
      : cap === null
        ? unavailable(`${reason}_cap_missing`, source)
        : result(value, "count", reason, sources);
  const constraintResult = (value: number, reason: string) =>
    timezoneUnavailable
      ? unavailable("timezone_missing_or_unsupported", source, true)
      : result(value, "count", reason, sources);
  const hardRestConflicts = activeEvents.filter((event) => {
    const effectiveStart = new Date(Math.max(Date.parse(event.startAt), (start as Date).getTime()));
    const key = localDateKey(effectiveStart, timezoneFormat as Intl.DateTimeFormat);
    return input.hardRestDays.includes(dayName(key));
  }).length;
  const dailyDurationExcesses = countDays(
    (events) =>
      input.maximumDailyMinutes !== null &&
      events.reduce((sum, event) => sum + clippedDuration(event), 0) > input.maximumDailyMinutes,
  );
  const dailySessionCapExcesses = countDays(
    (events) => input.maximumSessionsPerDay !== null && events.length > input.maximumSessionsPerDay,
  );
  const doubleDayConflicts = countDays(
    (events) => input.allowDoubleDays === false && events.length > 1,
  );
  const sessionDurationExcesses = activeEvents.filter(
    (event) =>
      input.maximumSessionDurationMinutes !== null &&
      clippedDuration(event) > input.maximumSessionDurationMinutes,
  ).length;
  const weeklyDurationExcesses = [...byWeek.values()].filter(
    (events) =>
      input.maximumWeeklyMinutes !== null &&
      events.reduce((sum, event) => sum + clippedDuration(event), 0) > input.maximumWeeklyMinutes,
  ).length;
  const weeklySessionCapExcesses = [...byWeek.values()].filter(
    (events) => input.maximumWeeklySessions !== null && events.length > input.maximumWeeklySessions,
  ).length;
  let sportOverrideExcesses = 0;
  for (const override of input.sportOverrides) {
    const sportEvents = activeEvents.filter((event) => event.sport === override.sport);
    sportOverrideExcesses += sportEvents.filter(
      (event) =>
        override.caps.maximumSessionDurationMinutes !== null &&
        clippedDuration(event) > override.caps.maximumSessionDurationMinutes,
    ).length;
    for (const events of byWeek.values()) {
      const sportWeek = events.filter((event) => event.sport === override.sport);
      if (
        override.caps.maximumWeeklyMinutes !== null &&
        sportWeek.reduce((sum, event) => sum + clippedDuration(event), 0) >
          override.caps.maximumWeeklyMinutes
      )
        sportOverrideExcesses += 1;
      if (
        override.caps.maximumSessionsPerWeek !== null &&
        sportWeek.length > override.caps.maximumSessionsPerWeek
      )
        sportOverrideExcesses += 1;
    }
  }
  const recoveryPreferenceConflicts =
    input.recoveryPreference === null
      ? null
      : input.recoveryPreference === "balanced" || input.recoveryPreference === "more"
        ? countDays((events) => events.length > 1)
        : 0;

  return trainingFeasibilityResultsSchema.parse({
    policyVersion: TRAINING_FEASIBILITY_POLICY_VERSION,
    timeCoverage: coverage(
      availableMinutes,
      demandedMinutes,
      "required_training_minutes_missing",
      "availability_time_coverage",
    ),
    requiredSessionCoverage: coverage(
      activeEvents.length,
      demandedSessions,
      "required_weekly_sessions_missing",
      "required_session_coverage",
    ),
    compatibleScheduledMinutes: timezoneUnavailable
      ? unavailable("timezone_missing_or_unsupported", source, true)
      : !validHorizon
        ? unavailable("goal_or_planning_horizon_missing", source)
        : result(
            compatibleScheduledMinutes,
            "minutes",
            "availability_compatible_scheduled_minutes",
            sources,
          ),
    scheduleCoverage: coverage(
      compatibleScheduledMinutes,
      demandedMinutes,
      "required_training_minutes_missing",
      "planned_schedule_coverage",
    ),
    constraints: {
      hardRestConflicts: constraintResult(hardRestConflicts, "hard_rest_conflicts"),
      dailyDurationExcesses: capResult(
        input.maximumDailyMinutes,
        dailyDurationExcesses,
        "daily_duration",
      ),
      dailySessionCapExcesses: capResult(
        input.maximumSessionsPerDay,
        dailySessionCapExcesses,
        "daily_session",
      ),
      doubleDayConflicts: capResult(input.allowDoubleDays, doubleDayConflicts, "double_day"),
      sessionDurationExcesses: capResult(
        input.maximumSessionDurationMinutes,
        sessionDurationExcesses,
        "session_duration",
      ),
      weeklyDurationExcesses: capResult(
        input.maximumWeeklyMinutes,
        weeklyDurationExcesses,
        "weekly_duration",
      ),
      weeklySessionCapExcesses: capResult(
        input.maximumWeeklySessions,
        weeklySessionCapExcesses,
        "weekly_session",
      ),
      sportOverrideExcesses: constraintResult(sportOverrideExcesses, "sport_override_excesses"),
      recoveryPreferenceConflicts: timezoneUnavailable
        ? unavailable("timezone_missing_or_unsupported", source, true)
        : recoveryPreferenceConflicts === null
          ? unavailable("recovery_preference_missing", source)
          : constraintResult(recoveryPreferenceConflicts, "recovery_preference_conflicts"),
    },
  });
}
