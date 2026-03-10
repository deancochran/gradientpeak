import { addDaysDateOnlyUtc } from "./dateOnlyUtc";

type SessionSource = Record<string, unknown>;

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export type MaterializedPlanEventType = "planned" | "rest_day";

export interface MaterializedPlanEvent {
  scheduled_date: string;
  starts_at: string;
  ends_at: string;
  title: string;
  event_type: MaterializedPlanEventType;
  activity_plan_id: string | null;
  all_day: true;
}

function toDayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function toNextDayStartIso(dateOnly: string): string {
  return `${addDaysDateOnlyUtc(dateOnly, 1)}T00:00:00.000Z`;
}

function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && dateOnlyPattern.test(value);
}

function isUuidString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function getSessionDate(
  session: SessionSource,
  baseDate: string,
): string | null {
  if (isDateOnlyString(session.scheduled_date)) {
    return session.scheduled_date;
  }

  const offsetDays =
    typeof session.offset_days === "number"
      ? session.offset_days
      : typeof session.day_offset === "number"
        ? session.day_offset
        : null;

  if (offsetDays === null) {
    return null;
  }

  return addDaysDateOnlyUtc(baseDate, offsetDays);
}

function getSessionEventType(
  session: SessionSource,
): MaterializedPlanEventType {
  const sessionType =
    typeof session.session_type === "string"
      ? session.session_type.toLowerCase()
      : "";

  return sessionType === "rest" || sessionType === "rest_day"
    ? "rest_day"
    : "planned";
}

/**
 * Materializes a template-like plan structure into all-day event records.
 *
 * Supported inputs:
 * - Root `sessions` with `scheduled_date` or `offset_days`/`day_offset`
 * - Nested `blocks[].sessions` with offsets relative to `block.start_date`
 *
 * The function is pure and performs no I/O.
 */
export function materializePlanToEvents(
  planStructure: unknown,
  startDate: string,
): MaterializedPlanEvent[] {
  if (!isDateOnlyString(startDate)) {
    return [];
  }

  if (!planStructure || typeof planStructure !== "object") {
    return [];
  }

  const root = planStructure as Record<string, unknown>;
  const rootStartDate = isDateOnlyString(root.start_date)
    ? root.start_date
    : startDate;

  const dedupe = new Set<string>();
  const materialized: MaterializedPlanEvent[] = [];

  const pushSession = (
    session: SessionSource,
    baseDate: string,
    fallbackTitle: string,
  ) => {
    const scheduledDate = getSessionDate(session, baseDate);
    if (!scheduledDate) {
      return;
    }

    const eventType = getSessionEventType(session);
    const activityPlanId =
      eventType === "planned" && isUuidString(session.activity_plan_id)
        ? session.activity_plan_id
        : null;

    const title =
      typeof session.title === "string" && session.title.trim().length > 0
        ? session.title.trim()
        : fallbackTitle;

    const key = `${scheduledDate}|${eventType}|${activityPlanId ?? "none"}|${title}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);

    materialized.push({
      scheduled_date: scheduledDate,
      starts_at: toDayStartIso(scheduledDate),
      ends_at: toNextDayStartIso(scheduledDate),
      title,
      event_type: eventType,
      activity_plan_id: activityPlanId,
      all_day: true,
    });
  };

  const rootSessions = Array.isArray(root.sessions)
    ? (root.sessions as SessionSource[])
    : [];
  for (const session of rootSessions) {
    pushSession(session, rootStartDate, "Planned Session");
  }

  const blocks = Array.isArray(root.blocks)
    ? (root.blocks as Array<Record<string, unknown>>)
    : [];

  for (const block of blocks) {
    const blockStartDate = isDateOnlyString(block.start_date)
      ? block.start_date
      : rootStartDate;
    const fallbackTitle =
      typeof block.name === "string" && block.name.trim().length > 0
        ? block.name.trim()
        : "Planned Session";

    const blockSessions = Array.isArray(block.sessions)
      ? (block.sessions as SessionSource[])
      : [];

    for (const session of blockSessions) {
      pushSession(session, blockStartDate, fallbackTitle);
    }
  }

  return materialized.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
