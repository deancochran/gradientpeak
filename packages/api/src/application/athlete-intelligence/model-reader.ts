import {
  type AthleteIntelligenceModelInput,
  type AthleteMetricType,
  athleteIntelligenceModelInputSchema,
  athleteMetricRoleByType,
  canonicalGoalObjectiveSchema,
  resolveCanonicalThresholds,
} from "@repo/core";
import {
  activities,
  activityEfforts,
  activityPlans,
  events,
  profileGoals,
  profileMetrics,
  profiles,
} from "@repo/db";
import { and, asc, desc, eq, gte, lte, type SQLWrapper, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  parseProfileTrainingSettings,
  readParsedProfileTrainingSettings,
} from "../profile-settings/profileTrainingSettings";
import {
  addEvidence,
  canonicalEffortValue,
  canonicalMetricValue,
  type EvidenceRegistry,
  lineageId,
  metricUnits,
  normalizeSport,
  parseScheduleRecurrence,
  sourceId,
} from "./evidence-adapters";

const DAY = 86_400_000;
const RECURRING_EVENT_PAGE_SIZE = 100;
const MAX_RECURRING_EVENTS_SCANNED = 1_000;
export const modelReaderBounds = {
  activityLookbackDays: 180,
  activities: 120,
  efforts: 200,
  metrics: 500,
  goals: 32,
  schedule: 100,
} as const;
const metricTypes = Object.keys(metricUnits) as AthleteMetricType[];

export interface AthleteIntelligenceRows {
  profile: {
    id: string;
    dob: Date | null;
    preferredUnits: "metric" | "imperial" | null;
    updatedAt: Date;
  } | null;
  metrics: Array<{
    profileId: string;
    id: string;
    referenceActivityId: string | null;
    type: string;
    value: number;
    unit: string;
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    source?: "manual" | "test" | "imported" | "provider" | "estimated" | "derived" | null;
    provenance?: unknown;
  }>;
  activities: Array<{
    profileId: string;
    id: string;
    activityPlanId: string | null;
    routeId: string | null;
    type: string;
    startedAt: Date;
    finishedAt: Date;
    durationSeconds: number;
    movingSeconds: number;
    distanceMeters: number;
    ascentMeters: number | null;
    descentMeters: number | null;
    calories: number | null;
    averageHeartRate: number | null;
    maximumHeartRate: number | null;
    averagePower: number | null;
    maximumPower: number | null;
    normalizedPower: number | null;
    averageCadence: number | null;
    maximumCadence: number | null;
    averageSpeed: number | null;
    maximumSpeed: number | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  efforts: Array<{
    profileId: string;
    id: string;
    activityId: string | null;
    recordedAt: Date;
    sport: string;
    kind: "power" | "speed";
    durationSeconds: number;
    startOffsetSeconds: number | null;
    unit: string;
    value: number;
    createdAt: Date;
    updatedAt: Date | null;
  }>;
  goals: Array<{
    profileId: string;
    id: string;
    targetDate: string | null;
    priority: number;
    activityCategory: string | null;
    targetPayload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
  trainingSettings: { profileId: string; settings: unknown; updatedAt: Date } | null;
  schedule: Array<{
    profileId: string;
    id: string;
    type: string;
    status: string;
    startsAt: Date;
    endsAt: Date | null;
    timezone: string;
    allDay: boolean;
    linkedActivityId: string | null;
    trainingPlanId: string | null;
    activityPlanId: string | null;
    routeId: string | null;
    createdAt: Date;
    updatedAt: Date;
    payload: unknown;
    recurrenceRule: string | null;
  }>;
  /** True when the recurring-event scan hit its explicit safety bound before source exhaustion. */
  scheduleTruncated?: boolean;
  /** Bounded source completeness carried into the canonical model contract. */
  readCoverage?: AthleteIntelligenceModelInput["readCoverage"];
}

type ScheduleRow = AthleteIntelligenceRows["schedule"][number];

export type ScheduleRecurrenceParseResult =
  | { state: "nonrecurring" }
  | { state: "supported"; recurrence: NonNullable<ReturnType<typeof parseScheduleRecurrence>> }
  | { state: "unsupported" }
  | { state: "malformed" };

/** Classifies persisted recurrence without silently conflating unsupported data with no recurrence. */
export function parsePersistedScheduleRecurrence(
  rule: string | null,
  startsAt: Date,
): ScheduleRecurrenceParseResult {
  if (rule === null || rule.trim() === "") return { state: "nonrecurring" };
  const recurrence = parseScheduleRecurrence(rule, startsAt);
  if (recurrence) return { state: "supported", recurrence };
  const body = rule.replace(/^RRULE:/i, "");
  const components = body.split(";");
  const structurallyValid = components.every((component) => {
    const separator = component.indexOf("=");
    return (
      separator > 0 && separator === component.lastIndexOf("=") && separator < component.length - 1
    );
  });
  if (!structurallyValid) return { state: "malformed" };
  const keys = components.map((component) =>
    component.slice(0, component.indexOf("=")).toUpperCase(),
  );
  if (new Set(keys).size !== keys.length) return { state: "malformed" };
  if (keys.some((key) => !["FREQ", "INTERVAL", "UNTIL"].includes(key))) {
    return { state: "unsupported" };
  }
  const frequency = components.find((component) => /^FREQ=/i.test(component))?.split("=")[1];
  if (frequency && !["DAILY", "WEEKLY", "MONTHLY"].includes(frequency.toUpperCase())) {
    return { state: "unsupported" };
  }
  return { state: "malformed" };
}

export async function readEligibleRecurringEventPages(input: {
  asOf: Date;
  limit: number;
  readPage: (offset: number, limit: number) => Promise<ScheduleRow[]>;
  pageSize?: number;
  maxScanned?: number;
}): Promise<{ rows: ScheduleRow[]; truncated: boolean }> {
  const pageSize = input.pageSize ?? RECURRING_EVENT_PAGE_SIZE;
  const maxScanned = input.maxScanned ?? MAX_RECURRING_EVENTS_SCANNED;
  const eligible: ScheduleRow[] = [];
  let scanned = 0;
  let recurrenceReadIncomplete = false;

  while (eligible.length <= input.limit && scanned < maxScanned) {
    const requestSize = Math.min(pageSize, maxScanned - scanned);
    const pageWithOverflow = await input.readPage(scanned, requestSize + 1);
    const hasMore = pageWithOverflow.length > requestSize;
    const page = pageWithOverflow.slice(0, requestSize);
    scanned += page.length;
    for (const row of page) {
      const parsed = parsePersistedScheduleRecurrence(row.recurrenceRule, row.startsAt);
      if (parsed.state === "unsupported" || parsed.state === "malformed") {
        recurrenceReadIncomplete = true;
      }
      if (
        parsed.state === "supported" &&
        (parsed.recurrence.until === null || new Date(parsed.recurrence.until) >= input.asOf)
      ) {
        eligible.push(row);
        if (eligible.length > input.limit) {
          return { rows: eligible.slice(0, input.limit), truncated: true };
        }
      }
    }
    if (!hasMore) return { rows: eligible, truncated: recurrenceReadIncomplete };
  }

  return { rows: eligible.slice(0, input.limit), truncated: true };
}

export function mergeBoundedScheduleRows(input: {
  asOf: Date;
  nonrecurringRows: ScheduleRow[];
  recurring: { rows: ScheduleRow[]; truncated: boolean };
  limit: number;
}): { rows: ScheduleRow[]; truncated: boolean } {
  const nonrecurringOverflow = input.nonrecurringRows.length > input.limit;
  const eligible = [...input.nonrecurringRows, ...input.recurring.rows];
  const retained = eligible
    .sort((a, b) => compareScheduleRelevance(input.asOf, a, b))
    .slice(0, input.limit)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
  return {
    rows: retained,
    truncated: input.recurring.truncated || nonrecurringOverflow || eligible.length > input.limit,
  };
}

function compareScheduleRelevance(asOf: Date, a: ScheduleRow, b: ScheduleRow): number {
  const relevance = (row: ScheduleRow) => {
    if (row.startsAt >= asOf) return 0;
    if (row.endsAt !== null && row.endsAt >= asOf) return 1;
    return 2;
  };
  const relevanceDifference = relevance(a) - relevance(b);
  if (relevanceDifference !== 0) return relevanceDifference;
  return a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id);
}

export interface AthleteIntelligenceDataSource {
  /** `asOf` is transaction/observation time. Exclude mutable rows created or updated after it. */
  read(input: {
    profileId: string;
    goalId: string;
    asOf: Date;
    activityFrom: Date;
    bounds: typeof modelReaderBounds;
  }): Promise<AthleteIntelligenceRows>;
}

export function createDrizzleAthleteIntelligenceDataSource(
  db: ReturnType<typeof getRequiredDb>,
): AthleteIntelligenceDataSource {
  return {
    async read(input) {
      const p = input.profileId;
      const goalRows = await db
        .select({
          profileId: profileGoals.profile_id,
          id: profileGoals.id,
          targetDate: profileGoals.target_date,
          priority: profileGoals.priority,
          activityCategory: profileGoals.activity_category,
          targetPayload: profileGoals.target_payload,
          createdAt: profileGoals.created_at,
          updatedAt: profileGoals.updated_at,
        })
        .from(profileGoals)
        .where(
          and(
            eq(profileGoals.id, input.goalId),
            eq(profileGoals.profile_id, p),
            lte(profileGoals.created_at, input.asOf),
            lte(profileGoals.updated_at, input.asOf),
          ),
        )
        .limit(1);
      const selectedGoal = goalRows[0];
      // A goal target is date-only. Until a typed planning timezone exists, this is
      // merely a conservative source scan boundary, not an authoritative local-day end.
      const targetEnd = selectedGoal?.targetDate
        ? new Date(`${selectedGoal.targetDate}T23:59:59.999Z`)
        : input.asOf;
      const scheduleThrough = targetEnd > input.asOf ? targetEnd : input.asOf;
      const temporalSummary = <T>(summaryValue: SQLWrapper, legacyValue: SQLWrapper) =>
        sql<T>`case when ${activities.updated_at} <= ${input.asOf} then coalesce(${summaryValue}, ${legacyValue}) else ${legacyValue} end`;
      const eventSelection = {
        profileId: events.profile_id,
        id: events.id,
        type: events.event_type,
        status: events.status,
        startsAt: events.starts_at,
        endsAt: events.ends_at,
        timezone: events.timezone,
        allDay: events.all_day,
        linkedActivityId: events.linked_activity_id,
        trainingPlanId: events.training_plan_id,
        activityPlanId: events.activity_plan_id,
        routeId: events.route_id,
        createdAt: events.created_at,
        updatedAt: events.updated_at,
        payload: events.payload,
        recurrenceRule: events.recurrence_rule,
      };
      const [
        profile,
        metricRows,
        activityRows,
        effortRows,
        settingsRows,
        currentEventRows,
        recurringEvents,
      ] = await Promise.all([
        db
          .select({
            id: profiles.id,
            dob: profiles.dob,
            preferredUnits: profiles.preferred_units,
            updatedAt: profiles.updated_at,
          })
          .from(profiles)
          .where(and(eq(profiles.id, p), lte(profiles.updated_at, input.asOf)))
          .limit(1),
        db
          .select({
            profileId: profileMetrics.profile_id,
            id: profileMetrics.id,
            referenceActivityId: profileMetrics.reference_activity_id,
            type: profileMetrics.metric_type,
            value: profileMetrics.value,
            unit: profileMetrics.unit,
            recordedAt: profileMetrics.recorded_at,
            createdAt: profileMetrics.created_at,
            updatedAt: profileMetrics.updated_at,
            source: profileMetrics.source,
            provenance: profileMetrics.provenance,
          })
          .from(profileMetrics)
          .where(
            and(
              eq(profileMetrics.profile_id, p),
              lte(profileMetrics.recorded_at, input.asOf),
              lte(profileMetrics.created_at, input.asOf),
              lte(profileMetrics.updated_at, input.asOf),
            ),
          )
          .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
          .limit(input.bounds.metrics + 1),
        db
          .select({
            profileId: activities.profile_id,
            id: activities.id,
            activityPlanId: activities.activity_plan_id,
            routeId: activityPlans.route_id,
            type: activities.type,
            startedAt: activities.started_at,
            finishedAt: activities.finished_at,
            durationSeconds: temporalSummary<number>(
              activities.duration_seconds,
              activities.duration_seconds,
            ),
            movingSeconds: temporalSummary<number>(
              activities.moving_seconds,
              activities.moving_seconds,
            ),
            distanceMeters: temporalSummary<number>(
              activities.distance_meters,
              activities.distance_meters,
            ),
            ascentMeters: temporalSummary<number | null>(
              activities.elevation_gain_meters,
              activities.elevation_gain_meters,
            ),
            descentMeters: temporalSummary<number | null>(
              activities.elevation_loss_meters,
              activities.elevation_loss_meters,
            ),
            calories: temporalSummary<number | null>(activities.calories, activities.calories),
            averageHeartRate: temporalSummary<number | null>(
              activities.avg_heart_rate,
              activities.avg_heart_rate,
            ),
            maximumHeartRate: temporalSummary<number | null>(
              activities.max_heart_rate,
              activities.max_heart_rate,
            ),
            averagePower: temporalSummary<number | null>(
              activities.avg_power,
              activities.avg_power,
            ),
            maximumPower: temporalSummary<number | null>(
              activities.max_power,
              activities.max_power,
            ),
            normalizedPower: temporalSummary<number | null>(
              activities.normalized_power,
              activities.normalized_power,
            ),
            averageCadence: temporalSummary<number | null>(
              activities.avg_cadence,
              activities.avg_cadence,
            ),
            maximumCadence: temporalSummary<number | null>(
              activities.max_cadence,
              activities.max_cadence,
            ),
            averageSpeed: temporalSummary<number | null>(
              activities.avg_speed_mps,
              activities.avg_speed_mps,
            ),
            maximumSpeed: temporalSummary<number | null>(
              activities.max_speed_mps,
              activities.max_speed_mps,
            ),
            createdAt: activities.created_at,
            updatedAt: activities.updated_at,
          })
          .from(activities)
          .leftJoin(
            activityPlans,
            and(
              eq(activityPlans.id, activities.activity_plan_id),
              eq(activityPlans.profile_id, activities.profile_id),
            ),
          )
          .where(
            and(
              eq(activities.profile_id, p),
              gte(activities.started_at, input.activityFrom),
              lte(activities.started_at, input.asOf),
              lte(activities.finished_at, input.asOf),
              lte(activities.created_at, input.asOf),
              lte(activities.updated_at, input.asOf),
            ),
          )
          .orderBy(desc(activities.started_at), desc(activities.id))
          .limit(input.bounds.activities + 1),
        db
          .select({
            profileId: activityEfforts.profile_id,
            id: activityEfforts.id,
            activityId: activityEfforts.activity_id,
            recordedAt: activityEfforts.recorded_at,
            sport: activityEfforts.activity_category,
            kind: activityEfforts.effort_type,
            durationSeconds: activityEfforts.duration_seconds,
            startOffsetSeconds: activityEfforts.start_offset,
            unit: activityEfforts.unit,
            value: activityEfforts.value,
            createdAt: activityEfforts.created_at,
            updatedAt: activityEfforts.updated_at,
          })
          .from(activityEfforts)
          .where(
            and(
              eq(activityEfforts.profile_id, p),
              lte(activityEfforts.recorded_at, input.asOf),
              lte(activityEfforts.created_at, input.asOf),
              sql`${activityEfforts.updated_at} is null or ${activityEfforts.updated_at} <= ${input.asOf}`,
            ),
          )
          .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.id))
          .limit(input.bounds.efforts + 1),
        readParsedProfileTrainingSettings(db, p, { asOf: input.asOf }),
        db
          .select(eventSelection)
          .from(events)
          .where(
            and(
              eq(events.profile_id, p),
              lte(events.created_at, input.asOf),
              lte(events.updated_at, input.asOf),
              lte(events.starts_at, scheduleThrough),
              sql`${events.recurrence_rule} is null`,
              sql`(${events.starts_at} >= ${input.asOf} or ${events.ends_at} is null or ${events.ends_at} >= ${input.asOf})`,
            ),
          )
          .orderBy(
            sql`case when ${events.starts_at} >= ${input.asOf} then 0 when ${events.ends_at} >= ${input.asOf} then 1 else 2 end`,
            asc(events.starts_at),
            asc(events.id),
          )
          .limit(input.bounds.schedule + 1),
        readEligibleRecurringEventPages({
          asOf: input.asOf,
          limit: input.bounds.schedule,
          readPage: (offset, limit) =>
            db
              .select(eventSelection)
              .from(events)
              .where(
                and(
                  eq(events.profile_id, p),
                  lte(events.created_at, input.asOf),
                  lte(events.updated_at, input.asOf),
                  lte(events.starts_at, scheduleThrough),
                  sql`${events.recurrence_rule} is not null`,
                ),
              )
              .orderBy(asc(events.starts_at), asc(events.id))
              .limit(limit)
              .offset(offset),
        }),
      ]);
      const boundedSchedule = mergeBoundedScheduleRows({
        asOf: input.asOf,
        nonrecurringRows: currentEventRows,
        recurring: recurringEvents,
        limit: input.bounds.schedule,
      });
      return {
        profile: profile[0] ?? null,
        metrics: metricRows.slice(0, input.bounds.metrics),
        activities: activityRows.slice(0, input.bounds.activities),
        efforts: effortRows.slice(0, input.bounds.efforts),
        goals: goalRows,
        trainingSettings: settingsRows,
        schedule: boundedSchedule.rows,
        scheduleTruncated: boundedSchedule.truncated,
        readCoverage: {
          metrics:
            metricRows.length > input.bounds.metrics
              ? { state: "truncated", reason: "query_limit_reached" }
              : { state: "complete", reason: null },
          activities:
            activityRows.length > input.bounds.activities
              ? { state: "truncated", reason: "query_limit_reached" }
              : { state: "complete", reason: null },
          efforts:
            effortRows.length > input.bounds.efforts
              ? { state: "truncated", reason: "query_limit_reached" }
              : { state: "complete", reason: null },
          schedules: boundedSchedule.truncated
            ? { state: "truncated", reason: "query_limit_reached" }
            : selectedGoal?.targetDate !== null && selectedGoal?.targetDate !== undefined
              ? { state: "truncated", reason: "source_window_truncated" }
              : { state: "complete", reason: null },
        },
      };
    },
  };
}

export async function materializeAthleteIntelligenceModelInput(input: {
  dataSource: AthleteIntelligenceDataSource;
  profileId: string;
  goalId?: string;
  asOf: Date;
  activityLookbackDays?: number;
}): Promise<AthleteIntelligenceModelInput> {
  const asOf = new Date(input.asOf);
  const goalId = input.goalId ?? "goal-1";
  const from = new Date(
    asOf.getTime() -
      Math.min(
        Math.max(input.activityLookbackDays ?? modelReaderBounds.activityLookbackDays, 1),
        modelReaderBounds.activityLookbackDays,
      ) *
        DAY,
  );
  const rows = await input.dataSource.read({
    profileId: input.profileId,
    goalId,
    asOf,
    activityFrom: from,
    bounds: modelReaderBounds,
  });
  if (!rows.profile || rows.profile.id !== input.profileId || rows.profile.updatedAt > asOf)
    throw new Error("Athlete profile not found");
  const ownedRows = [
    ...rows.metrics,
    ...rows.activities,
    ...rows.efforts,
    ...rows.goals,
    ...rows.schedule,
    ...(rows.trainingSettings ? [rows.trainingSettings] : []),
  ];
  if (ownedRows.some((row) => row.profileId !== input.profileId)) {
    throw new Error("Athlete intelligence data-source profile boundary violation");
  }
  const registry: EvidenceRegistry = {};
  const evidence = (
    namespace: "activity" | "metric" | "effort" | "goal" | "manual",
    id: string,
    field: string,
    observedAt: Date,
    value: number | null,
    unit: string | null,
    sourceType: Parameters<typeof addEvidence>[0]["sourceType"],
    sport: ReturnType<typeof normalizeSport> | null = null,
    lineageOpaqueId = id,
    lineageGroupOverride?: string,
    rawValue = value,
    rawUnit = unit,
    validityState: Parameters<typeof addEvidence>[0]["validityState"] = "valid",
    compatibilityState: Parameters<typeof addEvidence>[0]["compatibilityState"] = "compatible",
  ) =>
    addEvidence({
      registry,
      athleteId: input.profileId,
      sourceId: sourceId(namespace, id, field),
      lineageGroupId:
        lineageGroupOverride ??
        lineageId(
          namespace === "activity" || namespace === "effort"
            ? "activity"
            : namespace === "metric"
              ? "metric"
              : "manual-test",
          lineageOpaqueId,
        ),
      observedAt,
      value: rawValue,
      unit: rawUnit,
      sport,
      modality: field,
      sourceType,
      validityState,
      compatibilityState,
    });
  const measured = (
    namespace: Parameters<typeof evidence>[0],
    id: string,
    field: string,
    at: Date,
    value: number | null,
    unit: string,
    type: Parameters<typeof evidence>[6],
    sport: Parameters<typeof evidence>[7] = null,
    lineageOpaqueId = id,
    lineageGroupOverride?: string,
    rawValue = value,
    rawUnit = unit,
    validityState: Parameters<typeof evidence>[12] = "valid",
    compatibilityState: Parameters<typeof evidence>[13] = "compatible",
  ) => ({
    value,
    unit,
    evidenceSourceIds: [
      evidence(
        namespace,
        id,
        field,
        at,
        value,
        unit,
        type,
        sport,
        lineageOpaqueId,
        lineageGroupOverride,
        rawValue,
        rawUnit,
        validityState,
        compatibilityState,
      ),
    ],
  });
  const profileAt = rows.profile.updatedAt;
  const profileEvidence = evidence(
    "manual",
    `profile-${input.profileId}`,
    "preferences",
    profileAt,
    null,
    null,
    "manual_observation",
  );
  const boundedMetrics = [...rows.metrics]
    .filter((r) => r.recordedAt <= asOf && r.createdAt <= asOf && r.updatedAt <= asOf)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, modelReaderBounds.metrics);
  for (const row of boundedMetrics) {
    const supportedType = metricTypes.includes(row.type as AthleteMetricType);
    const canonical = supportedType
      ? canonicalMetricValue(row.type as AthleteMetricType, row.value, row.unit)
      : null;
    evidence(
      "metric",
      row.id,
      `${row.type}-raw`,
      row.recordedAt,
      row.value,
      row.unit,
      "profile_metric",
      null,
      row.id,
      row.referenceActivityId ? lineageId("activity", row.referenceActivityId) : undefined,
      row.value,
      row.unit,
      "valid",
      !supportedType ? "unsupported" : canonical === null ? "incompatible_unit" : "compatible",
    );
  }
  const latest = new Map<AthleteMetricType, AthleteIntelligenceRows["metrics"][number]>();
  for (const row of boundedMetrics)
    if (
      metricTypes.includes(row.type as AthleteMetricType) &&
      !latest.has(row.type as AthleteMetricType)
    )
      latest.set(row.type as AthleteMetricType, row);
  const canonicalFtp = resolveCanonicalThresholds({
    now: asOf.toISOString(),
    freshnessWindowMs: 90 * DAY,
    directMetrics: boundedMetrics.flatMap((row) => {
      if (row.type !== "ftp" || canonicalMetricValue("ftp", row.value, row.unit) === null)
        return [];
      return [
        {
          threshold: "cycling_ftp" as const,
          value: row.value,
          observedAt: row.recordedAt.toISOString(),
          source:
            row.source === "manual" || row.source === "provider" || row.source === "estimated"
              ? row.source
              : ("modeled" as const),
          locked:
            typeof row.provenance === "object" &&
            row.provenance !== null &&
            ((row.provenance as Record<string, unknown>).manual_override === true ||
              (
                (row.provenance as Record<string, unknown>).manual_override as
                  | { locked?: boolean }
                  | undefined
              )?.locked === true ||
              (row.provenance as Record<string, unknown>).locked === true),
        },
      ];
    }),
  }).cycling_ftp;
  if (canonicalFtp.observedAt !== null && canonicalFtp.source !== "observed_effort") {
    const selectedFtp = boundedMetrics.find(
      (row) => row.type === "ftp" && row.recordedAt.toISOString() === canonicalFtp.observedAt,
    );
    if (selectedFtp) latest.set("ftp", selectedFtp);
  }
  const metricEvidence = [...latest.entries()].flatMap(([type, row]) => {
    const value = canonicalMetricValue(type, row.value, row.unit);
    const metricLineage = row.referenceActivityId
      ? lineageId("activity", row.referenceActivityId)
      : undefined;
    const rawSource = sourceId("metric", row.id, `${type}-raw`);
    return [
      {
        metricType: type,
        role: athleteMetricRoleByType[type],
        value:
          value === null
            ? { value: row.value, unit: row.unit, evidenceSourceIds: [rawSource] }
            : measured(
                "metric",
                row.id,
                type,
                row.recordedAt,
                value,
                metricUnits[type],
                "profile_metric",
                null,
                row.id,
                metricLineage,
              ),
      },
    ];
  });
  const age = rows.profile.dob
    ? Math.max(0, Math.floor((asOf.getTime() - rows.profile.dob.getTime()) / (365.2425 * DAY)))
    : null;
  const ageSource = rows.profile.dob
    ? evidence(
        "manual",
        `profile-${input.profileId}`,
        "age",
        profileAt,
        age,
        "years",
        "manual_observation",
      )
    : evidence(
        "manual",
        `profile-${input.profileId}`,
        "age",
        profileAt,
        null,
        "years",
        "manual_observation",
      );
  metricEvidence.push({
    metricType: "age_years",
    role: athleteMetricRoleByType.age_years,
    value: { value: age, unit: "years", evidenceSourceIds: [ageSource] },
  });
  const weight = latest.get("weight_kg");
  const canonicalWeight = weight
    ? canonicalMetricValue("weight_kg", weight.value, weight.unit)
    : null;
  const weightLineage = weight?.referenceActivityId
    ? lineageId("activity", weight.referenceActivityId)
    : undefined;
  const physiology = {
    athleteId: input.profileId,
    ageYears: { value: age, unit: "years" as const, evidenceSourceIds: [ageSource] },
    weightKg:
      weight && canonicalWeight !== null
        ? measured(
            "metric",
            weight.id,
            "weight_kg",
            weight.recordedAt,
            canonicalWeight,
            "kilograms",
            "profile_metric",
            null,
            weight.id,
            weightLineage,
          )
        : weight
          ? measured(
              "metric",
              weight.id,
              "weight_kg-unavailable",
              weight.recordedAt,
              null,
              "kilograms",
              "profile_metric",
              null,
              weight.id,
              weightLineage,
              undefined,
              undefined,
              "valid",
              "incompatible_unit",
            )
          : measured(
              "manual",
              `profile-${input.profileId}`,
              "weight",
              profileAt,
              null,
              "kilograms",
              "manual_observation",
            ),
    heightCm: measured(
      "manual",
      `profile-${input.profileId}`,
      "height",
      profileAt,
      null,
      "centimeters",
      "manual_observation",
    ),
    bodyFatPercent: measured(
      "manual",
      `profile-${input.profileId}`,
      "body-fat",
      profileAt,
      null,
      "percent",
      "manual_observation",
    ),
    preferredUnits: {
      value:
        rows.profile.preferredUnits === "metric"
          ? {
              distance: "kilometers" as const,
              elevation: "meters" as const,
              mass: "kilograms" as const,
              temperature: "celsius" as const,
            }
          : rows.profile.preferredUnits === "imperial"
            ? {
                distance: "miles" as const,
                elevation: "feet" as const,
                mass: "pounds" as const,
                temperature: "fahrenheit" as const,
              }
            : { distance: null, elevation: null, mass: null, temperature: null },
      evidenceSourceIds: [profileEvidence],
    },
  };
  const activitiesOut = [...rows.activities]
    .filter(
      (r) =>
        r.startedAt >= from &&
        r.startedAt <= asOf &&
        r.finishedAt <= asOf &&
        r.createdAt <= asOf &&
        r.updatedAt <= asOf,
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, modelReaderBounds.activities)
    .map((row) => {
      const sport = normalizeSport(row.type);
      const record = evidence(
        "activity",
        row.id,
        "record",
        row.startedAt,
        null,
        null,
        "activity",
        sport,
      );
      const m = (field: string, value: number | null, unit: string) =>
        measured("activity", row.id, field, row.finishedAt, value, unit, "activity", sport);
      return {
        sourceId: record,
        athleteId: input.profileId,
        lineageGroupId: lineageId("activity", row.id),
        startedAt: row.startedAt.toISOString(),
        endedAt: row.finishedAt.toISOString(),
        sport,
        metrics: {
          elapsedDurationSeconds: m("elapsed", row.durationSeconds, "seconds"),
          movingDurationSeconds: m("moving", row.movingSeconds, "seconds"),
          distanceMeters: m("distance", row.distanceMeters, "meters"),
          ascentMeters: m("ascent", row.ascentMeters, "meters"),
          descentMeters: m("descent", row.descentMeters, "meters"),
          workKilojoules: m("work", null, "kilojoules"),
          caloriesKilocalories: m("calories", row.calories, "kilocalories"),
          averagePowerWatts: m("average-power", row.averagePower, "watts"),
          maximumPowerWatts: m("maximum-power", row.maximumPower, "watts"),
          normalizedPowerWatts: m("normalized-power", row.normalizedPower, "watts"),
          averageSpeedMetersPerSecond: m("average-speed", row.averageSpeed, "meters_per_second"),
          maximumSpeedMetersPerSecond: m("maximum-speed", row.maximumSpeed, "meters_per_second"),
          averageHeartRateBpm: m("average-heart-rate", row.averageHeartRate, "beats_per_minute"),
          maximumHeartRateBpm: m("maximum-heart-rate", row.maximumHeartRate, "beats_per_minute"),
          averageCadenceRpm: m("average-cadence", row.averageCadence, "revolutions_per_minute"),
          maximumCadenceRpm: m("maximum-cadence", row.maximumCadence, "revolutions_per_minute"),
          trainingLoad: { ...m("training-load", null, "score"), identity: null },
          aerobicTrainingEffect: m("aerobic-effect", null, "score"),
          anaerobicTrainingEffect: m("anaerobic-effect", null, "score"),
        },
        zonesAndCurves: [],
        // Relational lap payloads are intentionally omitted until their untyped JSON can be
        // validated into the frozen lap metric contract without guessing field semantics.
        laps: [],
      };
    });
  const includedActivities = new Set(activitiesOut.map((a) => a.sourceId));
  const efforts = [...rows.efforts]
    .filter(
      (r) =>
        r.recordedAt <= asOf &&
        r.createdAt <= asOf &&
        (r.updatedAt === null || r.updatedAt <= asOf) &&
        (!r.activityId || includedActivities.has(sourceId("activity", r.activityId, "record"))),
    )
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, modelReaderBounds.efforts)
    .flatMap((row) => {
      const canonical = canonicalEffortValue(row.kind, row.value, row.unit);
      const sport = normalizeSport(row.sport);
      const effortLineage = row.activityId ?? `effort-${row.id}`;
      evidence(
        "effort",
        row.id,
        "value-raw",
        row.recordedAt,
        row.value,
        row.unit,
        "activity_effort",
        sport,
        effortLineage,
        undefined,
        row.value,
        row.unit,
        "valid",
        canonical === null ? "incompatible_unit" : "compatible",
      );
      // The frozen effort union requires a positive canonical power/speed field, so an
      // incompatible raw effort remains registry-only rather than fabricating a value.
      if (!canonical) return [];
      const record = evidence(
        "effort",
        row.id,
        "record",
        row.recordedAt,
        null,
        null,
        "activity_effort",
        sport,
        effortLineage,
      );
      const durationEvidence = evidence(
        "effort",
        row.id,
        "duration",
        row.recordedAt,
        row.durationSeconds,
        "seconds",
        "activity_effort",
        sport,
        effortLineage,
      );
      const valueEvidence = evidence(
        "effort",
        row.id,
        "value",
        row.recordedAt,
        canonical.value,
        canonical.unit,
        "activity_effort",
        sport,
        effortLineage,
      );
      const start =
        row.startOffsetSeconds === null
          ? null
          : measured(
              "effort",
              row.id,
              "start",
              row.recordedAt,
              row.startOffsetSeconds,
              "seconds",
              "activity_effort",
              sport,
              effortLineage,
            );
      const end =
        row.startOffsetSeconds === null
          ? null
          : measured(
              "effort",
              row.id,
              "end",
              row.recordedAt,
              row.startOffsetSeconds + row.durationSeconds,
              "seconds",
              "activity_effort",
              sport,
              effortLineage,
            );
      return [
        {
          sourceId: record,
          athleteId: input.profileId,
          lineageGroupId: lineageId("activity", effortLineage),
          activitySourceId: row.activityId ? sourceId("activity", row.activityId, "record") : null,
          observedAt: row.recordedAt.toISOString(),
          sport,
          startOffsetSeconds: start,
          endOffsetSeconds: end,
          durationSeconds: row.durationSeconds,
          evidenceSourceIds: [durationEvidence, valueEvidence],
          kind: row.kind,
          ...(row.kind === "power"
            ? { powerWatts: canonical.value }
            : { speedMetersPerSecond: canonical.value }),
        },
      ];
    });
  const goals = [...rows.goals]
    .filter((r) => r.createdAt <= asOf && r.updatedAt <= asOf)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, modelReaderBounds.goals)
    .flatMap((row) => {
      const parsedObjective = canonicalGoalObjectiveSchema.safeParse(row.targetPayload);
      if (!parsedObjective.success) return [];
      const goalSport = row.activityCategory === null ? null : normalizeSport(row.activityCategory);
      const goalLineage = `goal-${row.id}`;
      const record = evidence(
        "goal",
        row.id,
        "record",
        row.updatedAt,
        null,
        null,
        "goal",
        goalSport,
        goalLineage,
      );
      return [
        {
          sourceId: record,
          athleteId: input.profileId,
          lineageGroupId: lineageId("manual-test", goalLineage),
          targetDate: row.targetDate,
          priority: row.priority,
          goalSport,
          objective: parsedObjective.data,
          evidenceSourceIds: [record],
        },
      ];
    });
  const currentSettings =
    rows.trainingSettings && rows.trainingSettings.updatedAt <= asOf ? rows.trainingSettings : null;
  const settings = parseProfileTrainingSettings(currentSettings?.settings);
  const settingsAt = currentSettings?.updatedAt ?? profileAt;
  const contextId = evidence(
    "manual",
    `settings-${input.profileId}`,
    "record",
    settingsAt,
    null,
    null,
    "manual_observation",
  );
  const setting = (field: string, value: number | null, unit: string) =>
    measured(
      "manual",
      `settings-${input.profileId}`,
      field,
      settingsAt,
      value,
      unit,
      "manual_observation",
    );
  const sportOverrides = settings?.dose_limits.sport_overrides ?? {};
  const weeklyTimeWindows = (settings?.availability.weekly_windows ?? []).flatMap((day) =>
    day.windows.map((window) => ({
      day: day.day,
      startMinuteLocal: window.start_minute_of_day,
      endMinuteLocal: window.end_minute_of_day,
    })),
  );
  const maximumSessionsPerDay = (settings?.availability.weekly_windows ?? []).reduce<number | null>(
    (maximum, day) =>
      day.max_sessions === undefined ? maximum : Math.max(maximum ?? 0, day.max_sessions),
    null,
  );
  const baselineEnabled = settings?.baseline_fitness?.is_enabled === true;
  const trainingContext = {
    sourceId: contextId,
    athleteId: input.profileId,
    lineageGroupId: lineageId("manual-test", `settings-${input.profileId}`),
    evidenceSourceIds: [contextId],
    preferredSports: Object.keys(sportOverrides).slice(0, 5).map(normalizeSport),
    weeklyTimeWindows: weeklyTimeWindows.slice(0, 35),
    hardRestDays: (settings?.availability.hard_rest_days ?? []).slice(0, 7),
    maximumWeeklyMinutes: setting(
      "maximum-weekly",
      settings?.dose_limits.max_weekly_duration_minutes ?? null,
      "minutes",
    ),
    maximumDailyMinutes: setting("maximum-daily", null, "minutes"),
    maximumSessionsPerDay: setting("maximum-sessions", maximumSessionsPerDay, "count"),
    maximumSessionDurationMinutes: setting(
      "maximum-session-duration",
      settings?.dose_limits.max_single_session_duration_minutes ?? null,
      "minutes",
    ),
    sportDoseLimits: Object.entries(sportOverrides)
      .slice(0, 5)
      .map(([sport, limits]) => ({
        sport: normalizeSport(sport),
        maximumWeeklyMinutes: setting(
          `sport-${sport}-weekly`,
          limits.max_weekly_duration_minutes ?? null,
          "minutes",
        ),
        maximumSessionsPerWeek: setting(
          `sport-${sport}-sessions`,
          limits.max_sessions_per_week ?? null,
          "count",
        ),
        maximumSessionDurationMinutes: setting(
          `sport-${sport}-session-duration`,
          limits.max_single_session_duration_minutes ?? null,
          "minutes",
        ),
      })),
    // Numeric preference ratios do not map defensibly to frozen categorical preferences.
    allowDoubleDays: null,
    minimumRecoveryHours: setting("minimum-recovery", null, "hours"),
    maximumConsecutiveTrainingDays: setting("maximum-consecutive", null, "days"),
    recoveryPreference: null,
    fatigueTolerance: setting(
      "fatigue-tolerance",
      settings?.recovery_preferences.systemic_fatigue_tolerance ?? null,
      "ratio",
    ),
    strategy: null,
    taperPreference: null,
    progressionPreference: null,
    // Persisted baseline overrides do not retain the exact sport/family/method/version/provider
    // identity needed to compare them with any activity load series. Abstain rather than leak a
    // dimensionless number into model calculations.
    ctlOverride: { ...setting("ctl-unavailable", null, "training_load"), identity: null },
    atlOverride: { ...setting("atl-unavailable", null, "training_load"), identity: null },
  };
  let recurrenceReadIncomplete = false;
  const selectedGoalTarget = rows.goals.find((goal) => goal.id === goalId)?.targetDate;
  const scheduleThrough = selectedGoalTarget
    ? new Date(`${selectedGoalTarget}T23:59:59.999Z`)
    : asOf;
  const plannedSchedule = [...rows.schedule]
    .filter((r) => {
      if (r.createdAt > asOf || r.updatedAt > asOf || r.startsAt > scheduleThrough) return false;
      if (r.startsAt >= asOf || r.endsAt === null || r.endsAt >= asOf) return true;
      const parsed = parsePersistedScheduleRecurrence(r.recurrenceRule, r.startsAt);
      if (parsed.state === "unsupported" || parsed.state === "malformed") {
        recurrenceReadIncomplete = true;
        return false;
      }
      return (
        parsed.state === "supported" &&
        (parsed.recurrence.until === null || new Date(parsed.recurrence.until) >= asOf)
      );
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, modelReaderBounds.schedule)
    .flatMap((row) => {
      const end = row.endsAt ?? row.startsAt;
      if (end < row.startsAt) return [];
      const sport =
        row.payload && typeof row.payload === "object" && "sport" in row.payload
          ? normalizeSport(String(row.payload.sport))
          : null;
      const eventType =
        row.type === "race"
          ? "race"
          : row.type === "rest_day"
            ? "rest"
            : row.type === "planned_activity"
              ? "training"
              : "other";
      const lifecycle =
        row.status === "completed"
          ? "completed"
          : row.status === "cancelled"
            ? "cancelled"
            : "planned";
      // Completed history belongs to activities, not the current/future planned schedule.
      if (lifecycle === "completed") return [];
      const record = evidence(
        eventType === "race" ? "goal" : "manual",
        `event-${row.id}`,
        "record",
        row.updatedAt,
        null,
        null,
        eventType === "race" ? "goal" : "manual_observation",
        sport,
      );
      const planLinkKinds = [
        row.trainingPlanId ? "training-plan" : null,
        row.activityPlanId ? "activity-plan" : null,
        row.routeId ? "route" : null,
      ].filter((kind): kind is string => kind !== null);
      const eventLineage = lineageId("manual-test", `event-${row.id}`);
      const planSourceId =
        planLinkKinds.length === 0
          ? null
          : evidence(
              "manual",
              `event-${row.id}`,
              `plan-${planLinkKinds.join("+")}`,
              row.updatedAt,
              null,
              null,
              "manual_observation",
              sport,
              `event-${row.id}`,
              eventLineage,
            );
      return [
        {
          sourceId: record,
          athleteId: input.profileId,
          lineageGroupId: eventLineage,
          startAt: row.startsAt.toISOString(),
          endAt: end.toISOString(),
          timezone: row.timezone,
          allDay: row.allDay,
          lifecycle,
          eventType,
          sport,
          recurrence: (() => {
            const parsed = parsePersistedScheduleRecurrence(row.recurrenceRule, row.startsAt);
            if (parsed.state === "unsupported" || parsed.state === "malformed") {
              recurrenceReadIncomplete = true;
              return null;
            }
            return parsed.state === "supported" ? parsed.recurrence : null;
          })(),
          completionActivitySourceId: null,
          planSourceId,
          evidenceSourceIds: [record],
        },
      ];
    });
  const sourceScheduleCoverage = rows.readCoverage?.schedules;
  const scheduleCoverage =
    sourceScheduleCoverage?.state === "truncated"
      ? sourceScheduleCoverage
      : rows.scheduleTruncated === true || recurrenceReadIncomplete
        ? { state: "truncated" as const, reason: "unknown" as const }
        : selectedGoalTarget !== null && selectedGoalTarget !== undefined
          ? { state: "truncated" as const, reason: "source_window_truncated" as const }
          : (sourceScheduleCoverage ?? { state: "complete" as const, reason: null });
  const readCoverage = rows.readCoverage
    ? { ...rows.readCoverage, schedules: scheduleCoverage }
    : {
        metrics: { state: "complete", reason: null },
        activities: { state: "complete", reason: null },
        efforts: { state: "complete", reason: null },
        schedules: scheduleCoverage,
      };
  const scheduleReadState = scheduleCoverage.state;
  return athleteIntelligenceModelInputSchema.parse({
    contractVersion: "phase-1",
    assessmentAsOf: asOf.toISOString(),
    athleteId: input.profileId,
    evidenceRegistry: registry,
    physiology,
    metricEvidence,
    activityWindow: { from: from.toISOString(), through: asOf.toISOString() },
    activities: activitiesOut,
    efforts,
    goals,
    trainingContext,
    plannedSchedule,
    readCoverage,
    scheduleReadState,
  });
}
