import {
  type CanonicalTrainingPlanStructure,
  canonicalTrainingPlanStructureSchema,
} from "../schemas/training_plan_structure";
import { scheduledDateTimeToIsoInstant } from "../utils/schedule-date";
import { addDaysDateOnlyUtc } from "./dateOnlyUtc";

type SessionSource = Record<string, unknown>;
type PlanNode = Record<string, unknown>;

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const nestedCollectionKeys = ["blocks", "weeks", "days"] as const;

export type MaterializedPlanEventType = "planned";

export interface MaterializedPlanEvent {
  scheduled_date: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  title: string;
  description: string | null;
  event_title_override: string | null;
  event_type: MaterializedPlanEventType;
  activity_plan_id: string | null;
  all_day: boolean;
  source_day_offset: number;
  source_path: string;
}

function getCanonicalStructure(planStructure: unknown): CanonicalTrainingPlanStructure | null {
  const directResult = canonicalTrainingPlanStructureSchema.safeParse(planStructure);
  if (directResult.success) {
    return directResult.data;
  }

  // Persistence adds the relational id and the application adapter may add start_date.
  // Remove only those boundary-owned fields without admitting other legacy fields.
  if (planStructure && typeof planStructure === "object" && !Array.isArray(planStructure)) {
    const {
      id: _persistedId,
      start_date: _legacyStartDate,
      ...candidate
    } = planStructure as Record<string, unknown>;
    const adaptedResult = canonicalTrainingPlanStructureSchema.safeParse(candidate);
    if (adaptedResult.success) {
      return adaptedResult.data;
    }
  }

  return null;
}

function getSessionTitleOverride(session: SessionSource): string | null {
  if (
    typeof session.event_title_override === "string" &&
    session.event_title_override.trim().length > 0
  ) {
    return session.event_title_override.trim();
  }

  return null;
}

function getLegacySessionTitle(session: SessionSource): string | null {
  if (typeof session.title === "string" && session.title.trim().length > 0) {
    return session.title.trim();
  }

  if (typeof session.name === "string" && session.name.trim().length > 0) {
    return session.name.trim();
  }

  return null;
}

function toDayStartIso(dateOnly: string, planningTimeZone: string): string {
  try {
    return scheduledDateTimeToIsoInstant({
      scheduledDate: dateOnly,
      time: "00:00",
      timeZone: planningTimeZone,
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Date-only events remain anchored by scheduled_date when local midnight is a DST gap/fold.
    return `${dateOnly}T00:00:00.000Z`;
  }
}

function toNextDayStartIso(dateOnly: string, planningTimeZone: string): string {
  return toDayStartIso(addDaysDateOnlyUtc(dateOnly, 1), planningTimeZone);
}

function getEventTiming(scheduledDate: string, planningTimeZone: string, startTime?: string) {
  if (startTime) {
    return {
      starts_at: scheduledDateTimeToIsoInstant({
        scheduledDate,
        time: startTime,
        timeZone: planningTimeZone,
      }),
      ends_at: null,
      all_day: false,
    } as const;
  }

  return {
    starts_at: toDayStartIso(scheduledDate, planningTimeZone),
    ends_at: toNextDayStartIso(scheduledDate, planningTimeZone),
    all_day: true,
  } as const;
}

function materializeCanonicalPlan(
  structure: CanonicalTrainingPlanStructure,
  startDate: string,
  planningTimeZone: string,
): MaterializedPlanEvent[] {
  return structure.sessions
    .map((session, index) => {
      const scheduledDate = addDaysDateOnlyUtc(startDate, session.offset_days);
      const overrides = session.event_overrides;
      const eventTitleOverride = overrides?.title ?? null;
      const timing = getEventTiming(scheduledDate, planningTimeZone, overrides?.start_time);

      return {
        scheduled_date: scheduledDate,
        ...timing,
        timezone: planningTimeZone,
        title: eventTitleOverride ?? "Planned Session",
        description: overrides?.description ?? null,
        event_title_override: eventTitleOverride,
        event_type: "planned" as const,
        activity_plan_id: session.activity_plan_id,
        source_day_offset: session.offset_days,
        source_path: `sessions.${index}`,
      };
    })
    .sort(
      (a, b) =>
        a.starts_at.localeCompare(b.starts_at) || a.source_path.localeCompare(b.source_path),
    );
}

function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && dateOnlyPattern.test(value);
}

function isUuidString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function getOffsetDays(source: Record<string, unknown>): number | null {
  const directOffset =
    typeof source.offset_days === "number"
      ? source.offset_days
      : typeof source.day_offset === "number"
        ? source.day_offset
        : null;

  if (directOffset !== null) {
    return directOffset;
  }

  const weekOffset =
    typeof source.offset_weeks === "number"
      ? source.offset_weeks
      : typeof source.week_offset === "number"
        ? source.week_offset
        : null;

  if (weekOffset !== null) {
    return weekOffset * 7;
  }

  return null;
}

function getSessionDate(session: SessionSource, baseDate: string): string | null {
  if (isDateOnlyString(session.scheduled_date)) {
    return session.scheduled_date;
  }

  const offsetDays = getOffsetDays(session);

  if (offsetDays === null) {
    return baseDate;
  }

  return addDaysDateOnlyUtc(baseDate, offsetDays);
}

function getNodeBaseDate(node: PlanNode, parentBaseDate: string): string {
  if (isDateOnlyString(node.start_date)) {
    return node.start_date;
  }

  const offsetDays = getOffsetDays(node);
  if (offsetDays === null || offsetDays === 0) {
    return parentBaseDate;
  }

  return addDaysDateOnlyUtc(parentBaseDate, offsetDays);
}

function shouldMaterializeSession(session: SessionSource): boolean {
  const sessionType =
    typeof session.session_type === "string" ? session.session_type.toLowerCase() : "";

  return sessionType !== "rest" && sessionType !== "rest_day";
}

/**
 * Materializes a training plan structure into deterministic event records.
 *
 * Supported inputs:
 * - Canonical version-1 relative sessions, anchored exclusively to `startDate`
 * - Legacy root or nested sessions with inherited offsets, explicit dates, or `start_date`
 *
 * Canonical `start_time` values are interpreted in the required IANA planning timezone.
 * Date-only arithmetic stays timezone-independent while all-day events span local midnight
 * to the following local midnight, including across daylight-saving changes. The function is
 * pure and performs no I/O.
 */
export function materializePlanToEvents(
  planStructure: unknown,
  startDate: string,
  planningTimeZone: string,
): MaterializedPlanEvent[] {
  if (!isDateOnlyString(startDate)) {
    return [];
  }

  if (!planStructure || typeof planStructure !== "object") {
    return [];
  }

  const canonicalStructure = getCanonicalStructure(planStructure);
  if (canonicalStructure) {
    return materializeCanonicalPlan(canonicalStructure, startDate, planningTimeZone);
  }

  // Everything below is the quarantined compatibility path for pre-canonical structures.
  const root = planStructure as Record<string, unknown>;
  const rootStartDate = isDateOnlyString(root.start_date) ? root.start_date : startDate;

  const dedupe = new Set<string>();
  const materialized: MaterializedPlanEvent[] = [];

  const pushSession = (
    session: SessionSource,
    baseDate: string,
    fallbackTitle: string,
    sourcePath: Array<string | number>,
  ) => {
    const scheduledDate = getSessionDate(session, baseDate);
    if (!scheduledDate) {
      return;
    }

    if (!shouldMaterializeSession(session)) {
      return;
    }

    const activityPlanId = isUuidString(session.activity_plan_id) ? session.activity_plan_id : null;
    const eventTitleOverride = getSessionTitleOverride(session);
    const title = eventTitleOverride ?? getLegacySessionTitle(session) ?? fallbackTitle;

    const timing = getEventTiming(scheduledDate, planningTimeZone);
    const key = `${timing.starts_at}|planned|${activityPlanId ?? "none"}|${title}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);

    materialized.push({
      scheduled_date: scheduledDate,
      ...timing,
      timezone: planningTimeZone,
      title,
      description: null,
      event_title_override: eventTitleOverride,
      event_type: "planned",
      activity_plan_id: activityPlanId,
      source_day_offset: diffDateOnly(baseDate, scheduledDate),
      source_path: sourcePath.join("."),
    });
  };

  const traverse = (
    node: PlanNode,
    baseDate: string,
    fallbackTitle: string,
    sourcePath: Array<string | number>,
  ) => {
    const nodeBaseDate = getNodeBaseDate(node, baseDate);
    const nodeTitle =
      typeof node.name === "string" && node.name.trim().length > 0
        ? node.name.trim()
        : fallbackTitle;

    const sessions = Array.isArray(node.sessions) ? (node.sessions as SessionSource[]) : [];
    for (const [index, session] of sessions.entries()) {
      pushSession(session, nodeBaseDate, nodeTitle, [...sourcePath, "sessions", index]);
    }

    for (const key of nestedCollectionKeys) {
      const children = Array.isArray(node[key]) ? (node[key] as PlanNode[]) : [];
      for (const [index, child] of children.entries()) {
        traverse(child, nodeBaseDate, nodeTitle, [...sourcePath, key, index]);
      }
    }
  };

  traverse(root, rootStartDate, "Planned Session", []);

  return materialized.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function diffDateOnly(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  return Math.round((end - start) / 86400000);
}
