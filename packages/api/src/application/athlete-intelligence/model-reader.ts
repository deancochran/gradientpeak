import {
  type AthleteMetricType,
  type AthletePerformanceModelSnapshot,
  type AthletePerformanceTargetFacts,
  addDaysDateOnlyUtc,
  athleteIntelligenceModelInputSchema,
  athleteMetricRoleByType,
  athleteMetricTypeSchema,
  canonicalGoalObjectiveSchema,
  type ParsedAthleteIntelligenceModelInput,
  projectAthletePerformanceTargetFacts,
} from "@repo/core";
import {
  getActivityEffortObservationStatus,
  hasTrustedActivityStreamEvidence,
} from "@repo/core/athlete-inputs";
import {
  type CyclingNormalizedPowerResult,
  cyclingNormalizedPowerResultSchema,
  selectCyclingNormalizedPowerWatts,
} from "@repo/core/calculations";
import type { PreferredUnitSystem } from "@repo/core/units";
import { canonicalEffortValue } from "@repo/core/units";
import { scheduledDateTimeToIsoInstant } from "@repo/core/utils/schedule-date";
import {
  activities,
  activityEfforts,
  activitySegments,
  events,
  profileGoals,
  profileMetrics,
  profiles,
} from "@repo/db";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  type ActivitySegmentReadRow,
  type ActivityWithSegments,
  buildActivitySegmentDerivedSummaries,
  type CanonicalCompletedObservationLoadProjection,
  projectCanonicalCompletedObservationLoads,
} from "../../lib/activity-analysis";
import {
  filterSupersededProfileOverrides,
  isClearedProfileOverride,
  resolveLatestObservationsByKey,
} from "../../utils/profile-override-observations";
import {
  parseProfileTrainingSettings,
  readParsedProfileTrainingSettings,
} from "../profile-settings/profileTrainingSettings";
import { adaptActivityTrainingLoads } from "./adapters/activities/activity-training-load-adapter";
import {
  addEvidence,
  canonicalMetricValue,
  type EvidenceRegistry,
  lineageId,
  metricUnits,
  normalizeActivityCategory,
  parseScheduleRecurrence,
  sourceId,
} from "./evidence-adapters";

const DAY = 86_400_000;
const EXACT_EFFORT_BOUNDARY_DURATION_TOLERANCE_SECONDS = 0.001;
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

export interface AthleteIntelligenceRows {
  profile: {
    id: string;
    dob: Date | null;
    planningTimezone: string | null;
    preferredUnits: PreferredUnitSystem | null;
    updatedAt: Date;
  } | null;
  metrics: Array<{
    profileId: string;
    id: string;
    parentActivityId?: string;
    referenceActivityId: string | null;
    referenceActivityCategory?: string | null;
    type: string;
    value: number;
    unit: string;
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    source?: "manual" | "test" | "imported" | "provider" | "estimated" | "derived" | null;
    method?: string | null;
    provenance?: unknown;
  }>;
  activities: Array<{
    profileId: string;
    id: string;
    /** Parent activity identity; `id` remains the activity-role segment key. */
    parentActivityId: string;
    activityPlanId: string | null;
    routeId: string | null;
    type: string;
    startedAt: Date;
    finishedAt: Date;
    durationSeconds: number;
    movingSeconds: number | null;
    distanceMeters: number;
    ascentMeters: number | null;
    descentMeters: number | null;
    calories: number | null;
    averageHeartRate: number | null;
    maximumHeartRate: number | null;
    averagePower: number | null;
    maximumPower: number | null;
    normalizedPowerResult: CyclingNormalizedPowerResult;
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
    activity_category: string;
    kind: "power" | "speed" | "heart_rate";
    durationSeconds: number;
    startOffsetSeconds: number | null;
    unit: string;
    value: number;
    method?: string | null;
    provenance?: unknown;
    source?: "manual" | "test" | "imported" | "provider" | "estimated" | "derived" | null;
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
    recurrenceTimezone?: string | null;
  }>;
  /** True when the recurring-event scan hit its explicit safety bound before source exhaustion. */
  scheduleTruncated?: boolean;
  /** Bounded source completeness carried into the canonical model contract. */
  readCoverage?: ParsedAthleteIntelligenceModelInput["readCoverage"];
  /** Canonical, fail-closed target projection for the request assessment instant. */
  performanceTargets: AthletePerformanceTargetFacts;
  /** Full canonical model retained for non-prescriptive capability projections. */
  performanceModel?: AthletePerformanceModelSnapshot;
  /** Canonical completed-observation Load; no intelligence-owned recalculation is permitted. */
  completedObservationLoads: CanonicalCompletedObservationLoadProjection[];
}

type ScheduleRow = AthleteIntelligenceRows["schedule"][number];

function resolveEffortWindowBoundaries(
  row: AthleteIntelligenceRows["efforts"][number],
  activityCategory: "bike" | "run" | "swim",
): { endSeconds: number | null; startSeconds: number | null } {
  const provenance =
    row.provenance && typeof row.provenance === "object" && !Array.isArray(row.provenance)
      ? row.provenance
      : null;
  const provenanceEntries = provenance === null ? [] : Object.entries(provenance);
  const exactStart = provenanceEntries.find(
    ([key]) => key === "exact_window_start_offset_seconds",
  )?.[1];
  const exactEnd = provenanceEntries.find(
    ([key]) => key === "exact_window_end_offset_seconds",
  )?.[1];
  const hasExactBoundaries =
    hasTrustedActivityStreamEvidence({
      activityCategory,
      activityId: row.activityId,
      durationSeconds: row.durationSeconds,
      effortType: row.kind,
      method: row.method ?? null,
      provenance: row.provenance,
      source: row.source ?? null,
      unit: row.unit,
      value: row.value,
    }) &&
    typeof exactStart === "number" &&
    Number.isFinite(exactStart) &&
    exactStart >= 0 &&
    typeof exactEnd === "number" &&
    Number.isFinite(exactEnd) &&
    exactEnd >= exactStart &&
    Math.abs(exactEnd - exactStart - row.durationSeconds) <=
      EXACT_EFFORT_BOUNDARY_DURATION_TOLERANCE_SECONDS;
  const startSeconds = hasExactBoundaries ? exactStart : row.startOffsetSeconds;
  return {
    startSeconds,
    endSeconds: hasExactBoundaries
      ? exactEnd
      : startSeconds === null
        ? null
        : startSeconds + row.durationSeconds,
  };
}

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
      const profile = await db
        .select({
          id: profiles.id,
          dob: profiles.dob,
          planningTimezone: profiles.planning_timezone,
          preferredUnits: profiles.preferred_units,
          updatedAt: profiles.updated_at,
        })
        .from(profiles)
        .where(and(eq(profiles.id, p), lte(profiles.updated_at, input.asOf)))
        .limit(1);
      const planningTimezone = profile[0]?.planningTimezone ?? null;
      const targetEnd =
        selectedGoal?.targetDate && planningTimezone
          ? new Date(
              new Date(
                scheduledDateTimeToIsoInstant({
                  scheduledDate: addDaysDateOnlyUtc(selectedGoal.targetDate, 1),
                  time: "00:00",
                  timeZone: planningTimezone,
                }),
              ).getTime() - 1,
            )
          : input.asOf;
      const scheduleThrough = targetEnd > input.asOf ? targetEnd : input.asOf;
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
        recurrenceTimezone: events.recurrence_timezone,
      };
      const [
        metricRows,
        activityRows,
        effortRows,
        settingsRows,
        currentEventRows,
        recurringEvents,
      ] = await Promise.all([
        db
          .select({
            profileId: profileMetrics.profile_id,
            id: profileMetrics.id,
            referenceActivityId: profileMetrics.reference_activity_id,
            referenceActivityCategory: sql<null>`null`,
            type: profileMetrics.metric_type,
            value: profileMetrics.value,
            unit: profileMetrics.unit,
            recordedAt: profileMetrics.recorded_at,
            createdAt: profileMetrics.created_at,
            updatedAt: profileMetrics.updated_at,
            source: profileMetrics.source,
            method: profileMetrics.method,
            provenance: profileMetrics.provenance,
          })
          .from(profileMetrics)
          .leftJoin(
            activities,
            and(
              eq(activities.id, profileMetrics.reference_activity_id),
              eq(activities.profile_id, profileMetrics.profile_id),
            ),
          )
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
            id: activitySegments.id,
            parentActivityId: activities.id,
            activityStartedAt: activities.started_at,
            activityFinishedAt: activities.finished_at,
            activityElapsedMs: activities.elapsed_ms,
            activityActiveMs: activities.active_ms,
            activityMovingMs: activities.moving_ms,
            activityTimingCoverage: activities.timing_coverage,
            activityDistanceMeters: activities.distance_meters,
            activityAverageHeartRate: activities.avg_heart_rate,
            activityMaximumHeartRate: activities.max_heart_rate,
            activityProvider: activities.provider,
            activityExternalId: activities.external_id,
            activitySegmentsRevision: activities.segments_revision,
            activityParserVersion: activities.parser_version,
            activityDecodedContractVersion: activities.decoded_contract_version,
            activityMaterializerVersion: activities.materializer_version,
            activityPlanId: activities.activity_plan_id,
            routeId: sql<string | null>`null`,
            type: sql<string>`${activitySegments.activity_category}`,
            segmentOrdinal: activitySegments.ordinal,
            segmentRole: activitySegments.role,
            segmentActivityCategory: activitySegments.activity_category,
            segmentStartOffsetMs: activitySegments.start_offset_ms,
            segmentEndOffsetMs: activitySegments.end_offset_ms,
            segmentSourceArtifactId: activitySegments.source_artifact_id,
            segmentSourceSessionIndex: activitySegments.source_session_index,
            segmentSourceMessageIndex: activitySegments.source_message_index,
            segmentRawTypeString: activitySegments.raw_type_string,
            segmentRawTypeInteger: activitySegments.raw_type_integer,
            segmentRawSportString: activitySegments.raw_sport_string,
            segmentRawSportInteger: activitySegments.raw_sport_integer,
            segmentRawSubSportString: activitySegments.raw_sub_sport_string,
            segmentRawSubSportInteger: activitySegments.raw_sub_sport_integer,
            segmentTimingCoverage: activitySegments.timing_coverage,
            segmentActiveMs: activitySegments.active_ms,
            segmentMovingMs: activitySegments.moving_ms,
            segmentSummary: activitySegments.summary,
            segmentSummaryVersion: activitySegments.summary_version,
            segmentRevision: activitySegments.segment_revision,
            segmentParserVersion: activitySegments.parser_version,
            segmentMaterializerVersion: activitySegments.materializer_version,
            startedAt: sql<Date>`${activities.started_at} + (${activitySegments.start_offset_ms} * interval '1 millisecond')`,
            finishedAt: sql<Date>`${activities.started_at} + (${activitySegments.end_offset_ms} * interval '1 millisecond')`,
            durationSeconds: sql<number>`coalesce(${activitySegments.active_ms}, ${activitySegments.end_offset_ms} - ${activitySegments.start_offset_ms}) / 1000.0`,
            movingSeconds: sql<
              number | null
            >`case when ${activitySegments.timing_coverage} = 'unavailable' then null else ${activitySegments.moving_ms} / 1000.0 end`,
            distanceMeters: sql<number>`coalesce((${activitySegments.summary} ->> 'distanceMeters')::double precision, 0)`,
            ascentMeters: sql<
              number | null
            >`(${activitySegments.summary} ->> 'ascentMeters')::double precision`,
            descentMeters: sql<
              number | null
            >`(${activitySegments.summary} ->> 'descentMeters')::double precision`,
            calories: sql<
              number | null
            >`(${activitySegments.summary} ->> 'caloriesKcal')::double precision`,
            averageHeartRate: sql<
              number | null
            >`(${activitySegments.summary} ->> 'averageHeartRateBpm')::double precision`,
            maximumHeartRate: sql<null>`null`,
            averagePower: sql<
              number | null
            >`(${activitySegments.summary} ->> 'averagePowerWatts')::double precision`,
            maximumPower: sql<null>`null`,
            normalizedPowerResult: sql<unknown>`${activitySegments.summary} -> 'normalizedPowerResult'`,
            averageCadence: sql<
              number | null
            >`(${activitySegments.summary} ->> 'averageCadenceRpm')::double precision`,
            maximumCadence: sql<null>`null`,
            averageSpeed: sql<
              number | null
            >`(${activitySegments.summary} ->> 'averageSpeedMetersPerSecond')::double precision`,
            maximumSpeed: sql<null>`null`,
            createdAt: activities.created_at,
            updatedAt: activities.updated_at,
          })
          .from(activities)
          .innerJoin(
            activitySegments,
            and(
              eq(activitySegments.activity_id, activities.id),
              eq(activitySegments.role, "activity"),
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
          .orderBy(desc(activities.started_at), asc(activitySegments.ordinal))
          .limit(input.bounds.activities + 1),
        db
          .select({
            profileId: activityEfforts.profile_id,
            id: activityEfforts.id,
            activityId: activityEfforts.activity_id,
            recordedAt: activityEfforts.recorded_at,
            activity_category: activityEfforts.activity_category,
            kind: activityEfforts.effort_type,
            durationSeconds: activityEfforts.duration_seconds,
            startOffsetSeconds: activityEfforts.start_offset,
            unit: activityEfforts.unit,
            value: activityEfforts.value,
            method: activityEfforts.method,
            provenance: activityEfforts.provenance,
            source: activityEfforts.source,
            createdAt: activityEfforts.created_at,
            updatedAt: activityEfforts.updated_at,
          })
          .from(activityEfforts)
          .where(
            and(
              eq(activityEfforts.profile_id, p),
              lte(activityEfforts.recorded_at, input.asOf),
              lte(activityEfforts.created_at, input.asOf),
              or(isNull(activityEfforts.updated_at), lte(activityEfforts.updated_at, input.asOf)),
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
      const boundedActivities = activityRows.slice(0, input.bounds.activities).map((activity) => ({
        ...activity,
        normalizedPowerResult: cyclingNormalizedPowerResultSchema.parse(
          activity.normalizedPowerResult,
        ),
      }));
      const canonicalActivitiesById = new Map<string, ActivityWithSegments>();
      for (const activity of boundedActivities) {
        if (
          typeof activity.parentActivityId !== "string" ||
          !(activity.activityStartedAt instanceof Date) ||
          !(activity.activityFinishedAt instanceof Date) ||
          typeof activity.activityElapsedMs !== "number" ||
          typeof activity.segmentOrdinal !== "number" ||
          typeof activity.segmentStartOffsetMs !== "number" ||
          typeof activity.segmentEndOffsetMs !== "number" ||
          activity.segmentSummary === undefined
        ) {
          continue;
        }
        const segment: ActivitySegmentReadRow = {
          id: activity.id,
          activity_id: activity.parentActivityId,
          ordinal: activity.segmentOrdinal,
          role: activity.segmentRole,
          activity_category: activity.segmentActivityCategory,
          start_offset_ms: activity.segmentStartOffsetMs,
          end_offset_ms: activity.segmentEndOffsetMs,
          source_artifact_id: activity.segmentSourceArtifactId,
          source_session_index: activity.segmentSourceSessionIndex,
          source_message_index: activity.segmentSourceMessageIndex,
          raw_type_string: activity.segmentRawTypeString,
          raw_type_integer: activity.segmentRawTypeInteger,
          raw_sport_string: activity.segmentRawSportString,
          raw_sport_integer: activity.segmentRawSportInteger,
          raw_sub_sport_string: activity.segmentRawSubSportString,
          raw_sub_sport_integer: activity.segmentRawSubSportInteger,
          timing_coverage: activity.segmentTimingCoverage,
          active_ms: activity.segmentActiveMs,
          moving_ms: activity.segmentMovingMs,
          summary: activity.segmentSummary,
          summary_version: activity.segmentSummaryVersion,
          segment_revision: activity.segmentRevision,
          parser_version: activity.segmentParserVersion,
          materializer_version: activity.segmentMaterializerVersion,
        };
        const existing = canonicalActivitiesById.get(activity.parentActivityId);
        if (existing) {
          existing.segments.push(segment);
          continue;
        }
        canonicalActivitiesById.set(activity.parentActivityId, {
          id: activity.parentActivityId,
          profile_id: activity.profileId,
          started_at: activity.activityStartedAt,
          finished_at: activity.activityFinishedAt,
          elapsed_ms: activity.activityElapsedMs,
          active_ms: activity.activityActiveMs,
          moving_ms: activity.activityMovingMs,
          timing_coverage: activity.activityTimingCoverage,
          distance_meters: activity.activityDistanceMeters,
          avg_heart_rate: activity.activityAverageHeartRate,
          max_heart_rate: activity.activityMaximumHeartRate,
          provider: activity.activityProvider,
          external_id: activity.activityExternalId,
          segments_revision: activity.activitySegmentsRevision,
          parser_version: activity.activityParserVersion,
          decoded_contract_version: activity.activityDecodedContractVersion,
          materializer_version: activity.activityMaterializerVersion,
          segments: [segment],
        });
      }
      const activityAnalysisStore = createActivityAnalysisStore(db);
      if (!activityAnalysisStore.getPerformanceModelAsOf) {
        throw new Error("Canonical performance-model reader is unavailable");
      }
      const [performanceModel, completedObservationSummaries] = await Promise.all([
        activityAnalysisStore.getPerformanceModelAsOf({ asOf: input.asOf, profileId: p }),
        buildActivitySegmentDerivedSummaries({
          store: activityAnalysisStore,
          profileId: p,
          activities: [...canonicalActivitiesById.values()],
          computedAsOf: input.asOf,
        }),
      ]);
      const completedObservationLoads = projectCanonicalCompletedObservationLoads(
        completedObservationSummaries,
      );
      const performanceTargets = projectAthletePerformanceTargetFacts(performanceModel);
      return {
        profile: profile[0] ?? null,
        metrics: metricRows.slice(0, input.bounds.metrics),
        activities: boundedActivities,
        efforts: effortRows.slice(0, input.bounds.efforts),
        goals: goalRows,
        trainingSettings: settingsRows,
        schedule: boundedSchedule.rows,
        scheduleTruncated: boundedSchedule.truncated,
        performanceModel,
        performanceTargets,
        completedObservationLoads,
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
}): Promise<ParsedAthleteIntelligenceModelInput> {
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
  if (
    (rows.performanceModel !== undefined &&
      (rows.performanceModel.athleteId !== input.profileId ||
        rows.performanceModel.asOf !== asOf.toISOString())) ||
    rows.performanceTargets.athleteId !== input.profileId ||
    rows.performanceTargets.asOf !== asOf.toISOString()
  ) {
    throw new Error("Athlete performance model does not match the assessed athlete and instant");
  }
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
    activity_category: ReturnType<typeof normalizeActivityCategory> | null = null,
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
      activity_category,
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
    activity_category: Parameters<typeof evidence>[7] = null,
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
        activity_category,
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
  const metricActivityCategory = (row: AthleteIntelligenceRows["metrics"][number]) => {
    return row.type === "lthr" && row.source !== "manual" && row.referenceActivityCategory
      ? normalizeActivityCategory(row.referenceActivityCategory)
      : null;
  };
  for (const row of boundedMetrics) {
    if (isClearedProfileOverride(row)) continue;
    const parsedType = athleteMetricTypeSchema.safeParse(row.type);
    const canonical = parsedType.success
      ? canonicalMetricValue(parsedType.data, row.value, row.unit)
      : null;
    evidence(
      "metric",
      row.id,
      `${row.type}-raw`,
      row.recordedAt,
      row.value,
      row.unit,
      "profile_metric",
      metricActivityCategory(row),
      row.id,
      row.referenceActivityId ? lineageId("activity", row.referenceActivityId) : undefined,
      row.value,
      row.unit,
      "valid",
      !parsedType.success ? "unsupported" : canonical === null ? "incompatible_unit" : "compatible",
    );
  }
  const resolvedLatestMetrics = resolveLatestObservationsByKey(boundedMetrics, (row) =>
    row.type === "lthr" ? `lthr:${metricActivityCategory(row) ?? "generic"}` : row.type,
  );
  const latest = new Map<AthleteMetricType, AthleteIntelligenceRows["metrics"][number]>();
  for (const row of resolvedLatestMetrics.values()) {
    if (!row) continue;
    const parsedType = athleteMetricTypeSchema.safeParse(row.type);
    if (parsedType.success) latest.set(parsedType.data, row);
  }
  const thresholdMetricTypes = new Set<AthleteMetricType>(["lthr", "max_hr"]);
  for (const type of thresholdMetricTypes) latest.delete(type);
  const metricEvidenceRows = [...latest.entries()];
  const metricEvidence = metricEvidenceRows.flatMap(([type, row]) => {
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
                metricActivityCategory(row),
                row.id,
                metricLineage,
              ),
      },
    ];
  });
  type HeartRateTargetFact =
    | AthletePerformanceTargetFacts["heartRate"]["bike"]["lthr"]
    | AthletePerformanceTargetFacts["heartRate"]["bike"]["maxHr"];
  const addCanonicalHeartRateTargetMetric = (
    metricType: "lthr" | "max_hr",
    activityCategory: "bike" | "run" | "swim",
    target: HeartRateTargetFact,
  ) => {
    if (target.status !== "available") return;
    const canonicalEvidenceId = evidence(
      "metric",
      `performance-target-${activityCategory}-${metricType}-${target.sourceEvidenceId}`,
      metricType,
      new Date(target.observedAt),
      target.valueBpm,
      metricUnits[metricType],
      "profile_metric",
      activityCategory,
      target.sourceEvidenceId,
      lineageId("activity", target.sourceActivityId),
    );
    metricEvidence.push({
      metricType,
      role: athleteMetricRoleByType[metricType],
      value: {
        value: target.valueBpm,
        unit: metricUnits[metricType],
        evidenceSourceIds: [canonicalEvidenceId],
      },
    });
  };
  for (const category of ["bike", "run", "swim"] as const) {
    addCanonicalHeartRateTargetMetric(
      "lthr",
      category,
      rows.performanceTargets.heartRate[category].lthr,
    );
    addCanonicalHeartRateTargetMetric(
      "max_hr",
      category,
      rows.performanceTargets.heartRate[category].maxHr,
    );
  }
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
  const boundedActivityRows = [...rows.activities]
    .filter(
      (r) =>
        r.startedAt >= from &&
        r.startedAt <= asOf &&
        r.finishedAt <= asOf &&
        r.createdAt <= asOf &&
        r.updatedAt <= asOf,
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, modelReaderBounds.activities);
  const boundedLoadEfforts = [...rows.efforts]
    .filter(
      (row) =>
        row.recordedAt <= asOf &&
        row.createdAt <= asOf &&
        (row.updatedAt === null || row.updatedAt <= asOf),
    )
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, modelReaderBounds.efforts);
  const adaptedTrainingLoads = adaptActivityTrainingLoads({
    projections: rows.completedObservationLoads,
  });
  if (adaptedTrainingLoads.status === "duplicate_activity") {
    throw new Error(
      `Athlete intelligence completed-observation delivery duplicated ${adaptedTrainingLoads.activityId}`,
    );
  }
  const trainingLoads = adaptedTrainingLoads.byActivityId;
  const activitiesOut = boundedActivityRows.map((row) => {
    const activity_category = normalizeActivityCategory(row.type);
    const trainingLoad = trainingLoads.get(row.id) ?? null;
    const record = evidence(
      "activity",
      row.id,
      "record",
      row.startedAt,
      null,
      null,
      "activity",
      activity_category,
    );
    const m = (field: string, value: number | null, unit: string) =>
      measured(
        "activity",
        row.id,
        field,
        row.finishedAt,
        value,
        unit,
        "activity",
        activity_category,
      );
    const normalizedPowerEvidence = m(
      "normalized-power",
      selectCyclingNormalizedPowerWatts(row.normalizedPowerResult),
      "watts",
    );
    return {
      sourceId: record,
      athleteId: input.profileId,
      lineageGroupId: lineageId("activity", row.id),
      startedAt: row.startedAt.toISOString(),
      endedAt: row.finishedAt.toISOString(),
      activity_category,
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
        normalizedPowerResult: {
          result: row.normalizedPowerResult,
          evidenceSourceIds: normalizedPowerEvidence.evidenceSourceIds,
        },
        averageSpeedMetersPerSecond: m("average-speed", row.averageSpeed, "meters_per_second"),
        maximumSpeedMetersPerSecond: m("maximum-speed", row.maximumSpeed, "meters_per_second"),
        averageHeartRateBpm: m("average-heart-rate", row.averageHeartRate, "beats_per_minute"),
        maximumHeartRateBpm: m("maximum-heart-rate", row.maximumHeartRate, "beats_per_minute"),
        averageCadenceRpm: m("average-cadence", row.averageCadence, "revolutions_per_minute"),
        maximumCadenceRpm: m("maximum-cadence", row.maximumCadence, "revolutions_per_minute"),
        trainingLoad: {
          ...m("training-load", trainingLoad?.value ?? null, "score"),
          identity: trainingLoad?.identity ?? null,
        },
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
  const boundedEfforts = boundedLoadEfforts.filter(
    (r) => !r.activityId || includedActivities.has(sourceId("activity", r.activityId, "record")),
  );
  const efforts = filterSupersededProfileOverrides(
    boundedEfforts,
    (row) => `${row.activity_category}:${row.kind}:${row.durationSeconds}:${row.unit}`,
  ).flatMap((row) => {
    const activity_category = normalizeActivityCategory(row.activity_category);
    const effortLineage = row.activityId ?? `effort-${row.id}`;
    const canonical = canonicalEffortValue({ kind: row.kind, value: row.value, unit: row.unit });
    const observationStatus =
      activity_category === "bike" || activity_category === "run" || activity_category === "swim"
        ? getActivityEffortObservationStatus({
            activityCategory: activity_category,
            effortType: row.kind,
            durationSeconds: row.durationSeconds,
            value: row.value,
            unit: row.unit,
            activityId: row.activityId,
            source: row.source ?? null,
            method: row.method ?? null,
            provenance: row.provenance,
          })
        : ("invalid" as const);
    if (
      activity_category === "other" ||
      activity_category === "strength" ||
      observationStatus !== "observed"
    ) {
      evidence(
        "effort",
        row.id,
        canonical === null ? "value-raw" : `value-${observationStatus}`,
        row.recordedAt,
        row.value,
        row.unit,
        "activity_effort",
        activity_category,
        effortLineage,
        undefined,
        row.value,
        row.unit,
        observationStatus === "review" ? "unknown" : "invalid",
        canonical === null ? "incompatible_unit" : "compatible",
      );
      return [];
    }
    evidence(
      "effort",
      row.id,
      "value-raw",
      row.recordedAt,
      row.value,
      row.unit,
      "activity_effort",
      activity_category,
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
      activity_category,
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
      activity_category,
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
      activity_category,
      effortLineage,
    );
    const { endSeconds, startSeconds } = resolveEffortWindowBoundaries(row, activity_category);
    const start =
      startSeconds === null
        ? null
        : measured(
            "effort",
            row.id,
            "start",
            row.recordedAt,
            startSeconds,
            "seconds",
            "activity_effort",
            activity_category,
            effortLineage,
          );
    const end =
      endSeconds === null
        ? null
        : measured(
            "effort",
            row.id,
            "end",
            row.recordedAt,
            endSeconds,
            "seconds",
            "activity_effort",
            activity_category,
            effortLineage,
          );
    return [
      {
        sourceId: record,
        athleteId: input.profileId,
        lineageGroupId: lineageId("activity", effortLineage),
        activitySourceId: row.activityId ? sourceId("activity", row.activityId, "record") : null,
        observedAt: row.recordedAt.toISOString(),
        activity_category,
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
      const goalActivityCategory =
        row.activityCategory === null ? null : normalizeActivityCategory(row.activityCategory);
      const goalLineage = `goal-${row.id}`;
      const record = evidence(
        "goal",
        row.id,
        "record",
        row.updatedAt,
        null,
        null,
        "goal",
        goalActivityCategory,
        goalLineage,
      );
      return [
        {
          sourceId: record,
          athleteId: input.profileId,
          lineageGroupId: lineageId("manual-test", goalLineage),
          targetDate: row.targetDate,
          priority: row.priority,
          goalActivityCategory,
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
  const activityCategoryOverrides = settings?.dose_limits.activity_category_overrides ?? {};
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
  const trainingContext = {
    sourceId: contextId,
    athleteId: input.profileId,
    lineageGroupId: lineageId("manual-test", `settings-${input.profileId}`),
    evidenceSourceIds: [contextId],
    preferredActivityCategories: Object.keys(activityCategoryOverrides)
      .slice(0, 5)
      .map(normalizeActivityCategory),
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
    activityCategoryDoseLimits: Object.entries(activityCategoryOverrides)
      .slice(0, 5)
      .map(([activity_category, limits]) => ({
        activity_category: normalizeActivityCategory(activity_category),
        maximumWeeklyMinutes: setting(
          `activity_category-${activity_category}-weekly`,
          limits.max_weekly_duration_minutes ?? null,
          "minutes",
        ),
        maximumSessionsPerWeek: setting(
          `activity_category-${activity_category}-sessions`,
          limits.max_sessions_per_week ?? null,
          "count",
        ),
        maximumSessionDurationMinutes: setting(
          `activity_category-${activity_category}-session-duration`,
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
    // Persisted baseline overrides do not retain the exact activity_category/family/method/version/provider
    // identity needed to compare them with any activity load series. Abstain rather than leak a
    // dimensionless number into model calculations.
    longTermLoadOverride: {
      ...setting("long-term-load-unavailable", null, "training_load"),
      identity: null,
    },
    recentLoadOverride: {
      ...setting("recent-load-unavailable", null, "training_load"),
      identity: null,
    },
  };
  let recurrenceReadIncomplete = false;
  const selectedGoalTarget = rows.goals.find((goal) => goal.id === goalId)?.targetDate;
  const scheduleThrough =
    selectedGoalTarget && rows.profile.planningTimezone
      ? new Date(
          new Date(
            scheduledDateTimeToIsoInstant({
              scheduledDate: addDaysDateOnlyUtc(selectedGoalTarget, 1),
              time: "00:00",
              timeZone: rows.profile.planningTimezone,
            }),
          ).getTime() - 1,
        )
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
      const activity_category =
        row.payload && typeof row.payload === "object" && "activity_category" in row.payload
          ? normalizeActivityCategory(String(row.payload.activity_category))
          : null;
      const eventType =
        row.type === "race_target"
          ? "race_target"
          : row.type === "rest_day"
            ? "rest"
            : row.type === "planned"
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
        eventType === "race_target" ? "goal" : "manual",
        `event-${row.id}`,
        "record",
        row.updatedAt,
        null,
        null,
        eventType === "race_target" ? "goal" : "manual_observation",
        activity_category,
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
              activity_category,
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
          activity_category,
          recurrence: (() => {
            const parsed = parsePersistedScheduleRecurrence(row.recurrenceRule, row.startsAt);
            if (parsed.state === "unsupported" || parsed.state === "malformed") {
              recurrenceReadIncomplete = true;
              return null;
            }
            return parsed.state === "supported"
              ? { ...parsed.recurrence, timezone: row.recurrenceTimezone ?? undefined }
              : null;
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
  return athleteIntelligenceModelInputSchema.parse({
    contractVersion: "phase-1",
    assessmentAsOf: asOf.toISOString(),
    athleteId: input.profileId,
    ...(rows.performanceModel === undefined ? {} : { performanceModel: rows.performanceModel }),
    planningTimezone: rows.profile.planningTimezone,
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
  });
}
