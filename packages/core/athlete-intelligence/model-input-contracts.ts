import { z } from "zod";
import { loadSeriesIdentitySchema, sameLoadSeriesIdentity } from "../load/load-series";
import { canonicalGoalObjectiveSchema } from "../schemas/goals/profile_goals";
import { canonicalSportSchema } from "../schemas/sport";
import {
  athleteMetricRoleByType,
  athleteMetricRoleSchema,
  athleteMetricTypeSchema,
  evidenceItemSchema,
} from "./evidence-contracts";
import { lineageGroupIdSchema, sourceIdSchema } from "./lineage";

const MAX_OBSERVATIONS = 2_000;
const MAX_EVIDENCE_SOURCES = 4_000;
const MAX_NESTED_OBSERVATIONS = 500;
const dateTimeSchema = z.string().datetime();
const evidenceSourceIdsSchema = z.array(sourceIdSchema).min(1).max(32);
const nullableNonnegativeNumberSchema = z.number().finite().nonnegative().nullable();
const nullablePositiveNumberSchema = z.number().finite().positive().nullable();

const identifiedLoadValueSchema = (unit: "score" | "training_load") =>
  z
    .object({
      value: nullableNonnegativeNumberSchema,
      unit: z.string(),
      evidenceSourceIds: evidenceSourceIdsSchema,
      identity: loadSeriesIdentitySchema.nullable().optional(),
    })
    .strict()
    .superRefine((load, context) => {
      if (load.unit !== unit) {
        context.addIssue({ code: "custom", path: ["unit"], message: `Load unit must be ${unit}` });
      }
      if (load.value !== null && load.identity == null) {
        context.addIssue({
          code: "custom",
          message: "Numeric load requires an exact load-series identity",
        });
      }
    });

/**
 * A bounded read never turns omitted rows into an absence claim. `state` is
 * machine-readable; `reason` is a closed explanation required for truncation.
 */
export const boundedReadCoverageSchema = z
  .discriminatedUnion("state", [
    z.object({ state: z.literal("complete"), reason: z.null() }).strict(),
    z
      .object({
        state: z.literal("truncated"),
        reason: z.enum(["query_limit_reached", "source_window_truncated", "unknown"]),
      })
      .strict(),
  ])
  .readonly();

export const modelReadCoverageSchema = z
  .object({
    metrics: boundedReadCoverageSchema,
    activities: boundedReadCoverageSchema,
    efforts: boundedReadCoverageSchema,
    schedules: boundedReadCoverageSchema,
  })
  .strict()
  .readonly();

const evidenced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, evidenceSourceIds: evidenceSourceIdsSchema }).strict();

const evidencedValue = <T extends z.ZodTypeAny>(value: T, unit: string) =>
  z
    .object({
      value,
      unit: z.literal(unit),
      evidenceSourceIds: evidenceSourceIdsSchema,
    })
    .strict();

export const preferredUnitsSchema = z
  .object({
    distance: z.enum(["kilometers", "miles"]).nullable(),
    elevation: z.enum(["meters", "feet"]).nullable(),
    mass: z.enum(["kilograms", "pounds"]).nullable(),
    temperature: z.enum(["celsius", "fahrenheit"]).nullable(),
  })
  .strict();

/** Physiology is normalized upstream; missing values remain null and no sex/gender formula applies. */
export const athletePhysiologyInputSchema = z
  .object({
    athleteId: z.string().min(1),
    ageYears: evidencedValue(nullableNonnegativeNumberSchema, "years"),
    weightKg: evidencedValue(nullablePositiveNumberSchema, "kilograms"),
    heightCm: evidencedValue(nullablePositiveNumberSchema, "centimeters"),
    bodyFatPercent: evidencedValue(z.number().finite().min(0).max(100).nullable(), "percent"),
    preferredUnits: evidenced(preferredUnitsSchema),
  })
  .strict();

export const metricEvidenceInputSchema = z
  .object({
    metricType: athleteMetricTypeSchema,
    role: athleteMetricRoleSchema,
    value: z
      .object({
        value: nullableNonnegativeNumberSchema,
        unit: z.string().min(1),
        evidenceSourceIds: evidenceSourceIdsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    if (athleteMetricRoleByType[input.metricType] !== input.role) {
      context.addIssue({ code: "custom", message: "Metric role must match the frozen role map" });
    }
  });

export const activityMetricsSchema = z
  .object({
    elapsedDurationSeconds: evidencedValue(nullableNonnegativeNumberSchema, "seconds"),
    movingDurationSeconds: evidencedValue(nullableNonnegativeNumberSchema, "seconds"),
    distanceMeters: evidencedValue(nullableNonnegativeNumberSchema, "meters"),
    ascentMeters: evidencedValue(nullableNonnegativeNumberSchema, "meters"),
    descentMeters: evidencedValue(nullableNonnegativeNumberSchema, "meters"),
    workKilojoules: evidencedValue(nullableNonnegativeNumberSchema, "kilojoules"),
    caloriesKilocalories: evidencedValue(nullableNonnegativeNumberSchema, "kilocalories"),
    averagePowerWatts: evidencedValue(nullableNonnegativeNumberSchema, "watts"),
    maximumPowerWatts: evidencedValue(nullableNonnegativeNumberSchema, "watts"),
    normalizedPowerWatts: evidencedValue(nullableNonnegativeNumberSchema, "watts"),
    averageSpeedMetersPerSecond: evidencedValue(
      nullableNonnegativeNumberSchema,
      "meters_per_second",
    ),
    maximumSpeedMetersPerSecond: evidencedValue(
      nullableNonnegativeNumberSchema,
      "meters_per_second",
    ),
    averageHeartRateBpm: evidencedValue(nullableNonnegativeNumberSchema, "beats_per_minute"),
    maximumHeartRateBpm: evidencedValue(nullableNonnegativeNumberSchema, "beats_per_minute"),
    averageCadenceRpm: evidencedValue(nullableNonnegativeNumberSchema, "revolutions_per_minute"),
    maximumCadenceRpm: evidencedValue(nullableNonnegativeNumberSchema, "revolutions_per_minute"),
    trainingLoad: identifiedLoadValueSchema("score"),
    aerobicTrainingEffect: evidencedValue(nullableNonnegativeNumberSchema, "score"),
    anaerobicTrainingEffect: evidencedValue(nullableNonnegativeNumberSchema, "score"),
  })
  .strict();

const boundedSeriesSchema = z
  .object({
    kind: z.enum(["power_zone", "heart_rate_zone", "pace_zone", "power_curve", "speed_curve"]),
    durationSeconds: z.number().finite().nonnegative().nullable(),
    lowerBound: z.number().finite().nonnegative().nullable(),
    upperBound: z.number().finite().nonnegative().nullable(),
    value: z.number().finite().nonnegative(),
    unit: z.enum(["seconds", "watts", "meters_per_second"]),
    evidenceSourceIds: evidenceSourceIdsSchema,
  })
  .strict();

const lapSchema = z
  .object({
    startOffsetSeconds: z.number().finite().nonnegative(),
    endOffsetSeconds: z.number().finite().nonnegative(),
    distanceMeters: nullableNonnegativeNumberSchema,
    averagePowerWatts: nullableNonnegativeNumberSchema,
    averageSpeedMetersPerSecond: nullableNonnegativeNumberSchema,
    averageHeartRateBpm: nullableNonnegativeNumberSchema,
    evidenceSourceIds: evidenceSourceIdsSchema,
  })
  .strict()
  .refine((lap) => lap.endOffsetSeconds >= lap.startOffsetSeconds, {
    message: "Lap end offset must not precede its start offset",
  });

export const activityObservationInputSchema = z
  .object({
    sourceId: sourceIdSchema,
    athleteId: z.string().min(1),
    lineageGroupId: lineageGroupIdSchema,
    startedAt: dateTimeSchema,
    endedAt: dateTimeSchema.nullable(),
    sport: canonicalSportSchema,
    metrics: activityMetricsSchema,
    zonesAndCurves: z.array(boundedSeriesSchema).max(MAX_NESTED_OBSERVATIONS),
    laps: z.array(lapSchema).max(MAX_NESTED_OBSERVATIONS),
  })
  .strict()
  .superRefine((activity, context) => {
    const identity = activity.metrics.trainingLoad.identity;
    if (identity != null && identity.sport !== activity.sport) {
      context.addIssue({
        code: "custom",
        path: ["metrics", "trainingLoad", "identity", "sport"],
        message: "Training-load identity sport must match the activity sport",
      });
    }
  })
  .refine(
    (activity) =>
      activity.endedAt === null || Date.parse(activity.endedAt) >= Date.parse(activity.startedAt),
    { message: "Activity end must not precede start" },
  );

const effortBaseSchema = z.object({
  sourceId: sourceIdSchema,
  athleteId: z.string().min(1),
  lineageGroupId: lineageGroupIdSchema,
  activitySourceId: sourceIdSchema.nullable(),
  observedAt: dateTimeSchema,
  sport: canonicalSportSchema,
  startOffsetSeconds: evidencedValue(z.number().finite().nonnegative(), "seconds").nullable(),
  endOffsetSeconds: evidencedValue(z.number().finite().nonnegative(), "seconds").nullable(),
  durationSeconds: z.number().finite().positive(),
  evidenceSourceIds: evidenceSourceIdsSchema,
});

export const effortObservationInputSchema = z
  .discriminatedUnion("kind", [
    effortBaseSchema
      .extend({ kind: z.literal("power"), powerWatts: z.number().finite().positive() })
      .strict(),
    effortBaseSchema
      .extend({ kind: z.literal("speed"), speedMetersPerSecond: z.number().finite().positive() })
      .strict(),
  ])
  .superRefine((effort, context) => {
    if (
      effort.startOffsetSeconds !== null &&
      effort.endOffsetSeconds !== null &&
      effort.endOffsetSeconds.value < effort.startOffsetSeconds.value
    ) {
      context.addIssue({ code: "custom", message: "Effort end offset must not precede start" });
    }
  });

export const goalInputSchema = z
  .object({
    sourceId: sourceIdSchema,
    athleteId: z.string().min(1),
    lineageGroupId: lineageGroupIdSchema,
    targetDate: z.string().date().nullable(),
    priority: z.number().int().min(0).max(10),
    /** Canonical persisted goal header sport, independent of objective payload shape. */
    goalSport: canonicalSportSchema.nullable().default(null),
    objective: canonicalGoalObjectiveSchema,
    evidenceSourceIds: evidenceSourceIdsSchema,
  })
  .strict();

const daySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const timeWindowSchema = z
  .object({
    day: daySchema,
    startMinuteLocal: z.number().int().min(0).max(1439),
    endMinuteLocal: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine((window) => window.endMinuteLocal > window.startMinuteLocal, {
    message: "Availability window must have positive duration",
  });

const sportDoseLimitSchema = z
  .object({
    sport: canonicalSportSchema,
    maximumWeeklyMinutes: evidencedValue(nullableNonnegativeNumberSchema, "minutes"),
    maximumSessionsPerWeek: evidencedValue(z.number().int().nonnegative().nullable(), "count"),
    maximumSessionDurationMinutes: evidencedValue(nullableNonnegativeNumberSchema, "minutes"),
  })
  .strict();

export const trainingContextInputSchema = z
  .object({
    sourceId: sourceIdSchema,
    athleteId: z.string().min(1),
    lineageGroupId: lineageGroupIdSchema,
    evidenceSourceIds: evidenceSourceIdsSchema,
    preferredSports: z.array(canonicalSportSchema).max(5),
    weeklyTimeWindows: z.array(timeWindowSchema).max(35),
    hardRestDays: z.array(daySchema).max(7),
    maximumWeeklyMinutes: evidencedValue(nullableNonnegativeNumberSchema, "minutes"),
    maximumDailyMinutes: evidencedValue(nullableNonnegativeNumberSchema, "minutes"),
    maximumSessionsPerDay: evidencedValue(z.number().int().min(1).max(4).nullable(), "count"),
    maximumSessionDurationMinutes: evidencedValue(nullableNonnegativeNumberSchema, "minutes"),
    sportDoseLimits: z.array(sportDoseLimitSchema).max(5),
    allowDoubleDays: z.boolean().nullable(),
    minimumRecoveryHours: evidencedValue(nullableNonnegativeNumberSchema, "hours"),
    maximumConsecutiveTrainingDays: evidencedValue(
      z.number().int().positive().max(31).nullable(),
      "days",
    ),
    recoveryPreference: z.enum(["more", "balanced", "less"]).nullable(),
    fatigueTolerance: evidencedValue(z.number().finite().min(0).max(1).nullable(), "ratio"),
    strategy: z.enum(["conservative", "balanced", "aggressive"]).nullable(),
    taperPreference: z.enum(["none", "short", "standard", "extended"]).nullable(),
    progressionPreference: z.enum(["steady", "step", "adaptive"]).nullable(),
    ctlOverride: identifiedLoadValueSchema("training_load"),
    atlOverride: identifiedLoadValueSchema("training_load"),
  })
  .strict()
  .superRefine((trainingContext, context) => {
    const ctl = trainingContext.ctlOverride;
    const atl = trainingContext.atlOverride;
    if (
      ctl.value !== null &&
      atl.value !== null &&
      ctl.identity != null &&
      atl.identity != null &&
      !sameLoadSeriesIdentity(ctl.identity, atl.identity)
    ) {
      context.addIssue({
        code: "custom",
        path: ["atlOverride", "identity"],
        message: "CTL and ATL overrides must use the same exact load-series identity",
      });
    }
  });

export const plannedScheduleObservationSchema = z
  .object({
    sourceId: sourceIdSchema,
    athleteId: z.string().min(1),
    lineageGroupId: lineageGroupIdSchema,
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
    timezone: z.string().trim().min(1).max(64),
    allDay: z.boolean(),
    lifecycle: z.enum(["planned", "confirmed", "completed", "cancelled"]),
    eventType: z.enum(["training", "race", "rest", "other"]),
    sport: canonicalSportSchema.nullable(),
    recurrence: z
      .object({
        frequency: z.enum(["daily", "weekly", "monthly"]),
        interval: z.number().int().min(1).max(52),
        until: dateTimeSchema.nullable(),
        /** IANA zone used to retain this recurrence's wall-clock schedule. */
        timezone: z.string().trim().min(1).max(64).nullable().optional(),
      })
      .strict()
      .nullable(),
    completionActivitySourceId: sourceIdSchema.nullable(),
    planSourceId: sourceIdSchema.nullable(),
    evidenceSourceIds: evidenceSourceIdsSchema,
  })
  .strict()
  .refine((event) => Date.parse(event.endAt) >= Date.parse(event.startAt), {
    message: "Schedule end must not precede start",
  })
  .refine(
    (event) =>
      event.recurrence?.until === null ||
      event.recurrence === null ||
      Date.parse(event.recurrence.until) >= Date.parse(event.startAt),
    {
      message: "Schedule recurrence end must not precede event start",
    },
  );

export const athleteIntelligenceModelInputSchema = z
  .object({
    contractVersion: z.string().min(1).max(32),
    assessmentAsOf: dateTimeSchema,
    athleteId: z.string().min(1),
    /** IANA zone in which planning dates, availability, and constraints are evaluated. */
    planningTimezone: z.string().trim().min(1).max(64).nullable().optional(),
    evidenceRegistry: z
      .record(sourceIdSchema, evidenceItemSchema)
      .refine(
        (registry) => Object.keys(registry).length <= MAX_EVIDENCE_SOURCES,
        "Evidence registry is too large",
      ),
    physiology: athletePhysiologyInputSchema,
    metricEvidence: z.array(metricEvidenceInputSchema).max(64),
    activityWindow: z.object({ from: dateTimeSchema, through: dateTimeSchema }).strict(),
    activities: z.array(activityObservationInputSchema).max(MAX_OBSERVATIONS),
    efforts: z.array(effortObservationInputSchema).max(MAX_OBSERVATIONS),
    goals: z.array(goalInputSchema).max(32),
    trainingContext: trainingContextInputSchema,
    /** Coverage for every bounded reader domain; policies must preserve truncation as uncertainty. */
    readCoverage: modelReadCoverageSchema.default({
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "complete", reason: null },
    }),
    /** @deprecated Use readCoverage.schedules. Kept while canonical readers migrate. */
    scheduleReadState: z.enum(["complete", "truncated"]),
    plannedSchedule: z.array(plannedScheduleObservationSchema).max(MAX_OBSERVATIONS),
  })
  .strict()
  .superRefine((input, context) => {
    const asOf = Date.parse(input.assessmentAsOf);
    const from = Date.parse(input.activityWindow.from);
    const through = Date.parse(input.activityWindow.through);
    const sourceIds = new Set(Object.keys(input.evidenceRegistry));
    const issue = (message: string, path?: PropertyKey[]): void => {
      context.addIssue({ code: "custom", message, path });
    };
    const referencedSourceIds: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) for (const item of value) collect(item);
      else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (key === "evidenceSourceIds" && Array.isArray(child))
            referencedSourceIds.push(...(child as string[]));
          else if (key !== "evidenceRegistry") collect(child);
        }
      }
    };
    collect(input);
    if (referencedSourceIds.some((id) => !sourceIds.has(id)))
      context.addIssue({
        code: "custom",
        message: "Every evidence source reference must exist in the registry",
      });
    if (Object.entries(input.evidenceRegistry).some(([id, item]) => id !== item.sourceId))
      context.addIssue({
        code: "custom",
        message: "Evidence registry keys must equal evidence source IDs",
      });
    if (Object.values(input.evidenceRegistry).some((item) => item.athleteId !== input.athleteId))
      context.addIssue({ code: "custom", message: "Evidence must belong to the assessed athlete" });
    const athleteOwned = [
      input.physiology,
      input.trainingContext,
      ...input.activities,
      ...input.efforts,
      ...input.goals,
      ...input.plannedSchedule,
    ];
    if (athleteOwned.some((item) => item.athleteId !== input.athleteId))
      context.addIssue({
        code: "custom",
        message: "All model inputs must belong to the assessed athlete",
      });
    if (from > through || through > asOf)
      context.addIssue({
        code: "custom",
        message: "Activity window must end at or before assessment",
      });
    if (input.scheduleReadState !== input.readCoverage.schedules.state)
      issue("Legacy schedule read state must match bounded schedule coverage");
    if (
      input.activities.some(
        (activity) =>
          Date.parse(activity.startedAt) < from ||
          Date.parse(activity.startedAt) > through ||
          (activity.endedAt !== null && Date.parse(activity.endedAt) > asOf),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Activities must be inside the bounded window and assessment time",
      });
    if (input.efforts.some((effort) => Date.parse(effort.observedAt) > asOf))
      context.addIssue({ code: "custom", message: "Efforts must not occur after assessment" });
    if (Object.values(input.evidenceRegistry).some((item) => Date.parse(item.observedAt) > asOf))
      context.addIssue({ code: "custom", message: "Evidence must not occur after assessment" });

    const recordSources = [
      ...input.activities.map((record) => record.sourceId),
      ...input.efforts.map((record) => record.sourceId),
      ...input.goals.map((record) => record.sourceId),
      input.trainingContext.sourceId,
      ...input.plannedSchedule.map((record) => record.sourceId),
    ];
    if (recordSources.some((id) => !sourceIds.has(id)))
      issue("Every source-bearing record must resolve to the evidence registry");

    const validateMeasuredValues = (value: unknown, path: PropertyKey[] = []): void => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => {
          validateMeasuredValues(child, [...path, index]);
        });
        return;
      }
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (
        "value" in record &&
        "unit" in record &&
        typeof record.unit === "string" &&
        Array.isArray(record.evidenceSourceIds)
      ) {
        const matches = record.evidenceSourceIds.some((id) => {
          const observation = input.evidenceRegistry[id as string]?.rawObservation;
          return (
            observation !== undefined &&
            observation.value === record.value &&
            observation.unit === record.unit
          );
        });
        if (!matches)
          issue("Evidenced values must match a referenced raw observation value and unit", path);
      }
      for (const [key, child] of Object.entries(record)) {
        if (key !== "evidenceRegistry") validateMeasuredValues(child, [...path, key]);
      }
    };
    validateMeasuredValues(input);

    const activityById = new Map(input.activities.map((activity) => [activity.sourceId, activity]));
    const validateRecordSource = (
      record: {
        sourceId: string;
        athleteId: string;
        lineageGroupId: string;
      },
      expectedSourceType: "activity" | "activity_effort" | "goal" | "manual_observation",
      sport: string | null,
    ) => {
      const source = input.evidenceRegistry[record.sourceId];
      if (
        source &&
        (source.athleteId !== record.athleteId ||
          source.lineageGroupId !== record.lineageGroupId ||
          source.sport !== sport ||
          source.sourceType !== expectedSourceType)
      )
        issue("Record source must preserve athlete, lineage, applicable sport, and source type");
    };
    const rawMatches = (ids: string[], value: number, unit: string): boolean =>
      ids.some((id) => {
        const raw = input.evidenceRegistry[id]?.rawObservation;
        return raw?.value === value && raw.unit === unit;
      });
    for (const activity of input.activities) {
      validateRecordSource(activity, "activity", activity.sport);
      for (const series of activity.zonesAndCurves) {
        if (
          series.durationSeconds !== null &&
          !rawMatches(series.evidenceSourceIds, series.durationSeconds, "seconds")
        )
          issue("Activity series duration must match referenced evidence");
        for (const bound of [series.lowerBound, series.upperBound]) {
          if (bound !== null && !rawMatches(series.evidenceSourceIds, bound, series.unit))
            issue("Activity series bounds must match referenced evidence");
        }
      }
      for (const lap of activity.laps) {
        const measurements = [
          [lap.startOffsetSeconds, "seconds"],
          [lap.endOffsetSeconds, "seconds"],
          [lap.distanceMeters, "meters"],
          [lap.averagePowerWatts, "watts"],
          [lap.averageSpeedMetersPerSecond, "meters_per_second"],
          [lap.averageHeartRateBpm, "beats_per_minute"],
        ] as const;
        if (
          measurements.some(
            ([value, unit]) => value !== null && !rawMatches(lap.evidenceSourceIds, value, unit),
          )
        )
          issue("Lap measurements must match referenced evidence");
      }
    }
    for (const effort of input.efforts) {
      validateRecordSource(effort, "activity_effort", effort.sport);
      if (!rawMatches(effort.evidenceSourceIds, effort.durationSeconds, "seconds"))
        issue("Effort duration must match referenced evidence");
      const measuredValue =
        effort.kind === "power" ? effort.powerWatts : effort.speedMetersPerSecond;
      const measuredUnit = effort.kind === "power" ? "watts" : "meters_per_second";
      if (!rawMatches(effort.evidenceSourceIds, measuredValue, measuredUnit))
        issue("Effort measurement must match referenced evidence");
      for (const offset of [effort.startOffsetSeconds, effort.endOffsetSeconds]) {
        if (offset !== null && !rawMatches(offset.evidenceSourceIds, offset.value, "seconds"))
          issue("Effort offsets must match referenced seconds evidence");
      }
      const linked =
        effort.activitySourceId === null ? undefined : activityById.get(effort.activitySourceId);
      if (effort.activitySourceId !== null && !linked) {
        issue("Linked efforts must reference an included activity");
        continue;
      }
      if (!linked) continue;
      if (
        linked.athleteId !== effort.athleteId ||
        linked.lineageGroupId !== effort.lineageGroupId ||
        linked.sport !== effort.sport
      )
        issue("Activity-derived efforts must preserve athlete, lineage, and sport");
      const activityStart = Date.parse(linked.startedAt);
      const activityEnd = linked.endedAt === null ? null : Date.parse(linked.endedAt);
      const observedAt = Date.parse(effort.observedAt);
      if (observedAt < activityStart || (activityEnd !== null && observedAt > activityEnd))
        issue("Activity-derived effort timestamp must fall within its activity");
      const duration =
        activityEnd === null
          ? linked.metrics.elapsedDurationSeconds.value
          : (activityEnd - activityStart) / 1000;
      if (
        duration !== null &&
        ((effort.startOffsetSeconds !== null && effort.startOffsetSeconds.value > duration) ||
          (effort.endOffsetSeconds !== null && effort.endOffsetSeconds.value > duration))
      )
        issue("Activity-derived effort offsets must be within activity duration");
    }

    for (const goal of input.goals) validateRecordSource(goal, "goal", goal.goalSport);
    validateRecordSource(input.trainingContext, "manual_observation", null);

    for (const event of input.plannedSchedule) {
      // Phase 1 source types represent races as goals and other schedule declarations as manual evidence.
      validateRecordSource(
        event,
        event.eventType === "race" ? "goal" : "manual_observation",
        event.sport,
      );
      if (event.planSourceId !== null && !sourceIds.has(event.planSourceId))
        issue("Schedule plan references must resolve to the evidence registry");
      const planSource =
        event.planSourceId === null ? undefined : input.evidenceRegistry[event.planSourceId];
      if (
        planSource &&
        (planSource.athleteId !== event.athleteId ||
          planSource.lineageGroupId !== event.lineageGroupId ||
          (planSource.sport !== null && planSource.sport !== event.sport) ||
          !["goal", "manual_observation"].includes(planSource.sourceType))
      )
        issue("Schedule plan source must preserve athlete, lineage, sport, and plan source type");
      if (event.lifecycle !== "completed" && event.completionActivitySourceId !== null)
        issue("Non-completed schedule events must not contain completion activities");
      if (event.lifecycle === "completed" && event.completionActivitySourceId === null) {
        issue("Completed schedule events require a completion activity");
        continue;
      }
      if (event.completionActivitySourceId === null) continue;
      const completion = activityById.get(event.completionActivitySourceId);
      if (!completion) {
        issue("Schedule completion must reference an included activity");
        continue;
      }
      const completionSource = input.evidenceRegistry[event.completionActivitySourceId];
      if (
        !completionSource ||
        completionSource.athleteId !== event.athleteId ||
        completionSource.lineageGroupId !== completion.lineageGroupId ||
        completionSource.sport !== completion.sport ||
        completionSource.sourceType !== "activity"
      )
        issue(
          "Schedule completion source must preserve athlete, lineage, sport, and activity type",
        );
      const completionTime = Date.parse(completion.startedAt);
      if (
        completion.athleteId !== event.athleteId ||
        (event.sport !== null && completion.sport !== event.sport) ||
        completionTime < Date.parse(event.startAt) ||
        completionTime > Date.parse(event.endAt)
      )
        issue("Schedule completion must preserve athlete, sport, and scheduled time");
    }
    if (
      input.plannedSchedule.some(
        (event) => event.lifecycle === "completed" && Date.parse(event.endAt) > asOf,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Completed schedule events must not be in the future",
      });
  });

export type PreferredUnits = z.infer<typeof preferredUnitsSchema>;
export type AthletePhysiologyInput = z.infer<typeof athletePhysiologyInputSchema>;
export type MetricEvidenceInput = z.infer<typeof metricEvidenceInputSchema>;
export type ActivityObservationInput = z.infer<typeof activityObservationInputSchema>;
export type EffortObservationInput = z.infer<typeof effortObservationInputSchema>;
export type GoalInput = z.infer<typeof goalInputSchema>;
export type TrainingContextInput = z.infer<typeof trainingContextInputSchema>;
export type PlannedScheduleObservation = z.infer<typeof plannedScheduleObservationSchema>;
export type BoundedReadCoverage = z.infer<typeof boundedReadCoverageSchema>;
export type ModelReadCoverage = z.infer<typeof modelReadCoverageSchema>;
/**
 * Compatibility input accepted by current policy callers. Parsing through the
 * canonical schema always materializes `readCoverage` with every domain.
 */
export type AthleteIntelligenceModelInput = Omit<
  z.infer<typeof athleteIntelligenceModelInputSchema>,
  "readCoverage"
> & {
  readCoverage?: ModelReadCoverage;
};
export type ParsedAthleteIntelligenceModelInput = z.infer<
  typeof athleteIntelligenceModelInputSchema
>;
