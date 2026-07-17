import {
  type CanonicalTrainingPlanStructure,
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "../schemas/training_plan_structure";
import { scheduledDateTimeToIsoInstant } from "../utils/schedule-date";
import { addDaysDateOnlyUtc } from "./dateOnlyUtc";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

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

function getCanonicalStructure(planStructure: unknown): CanonicalTrainingPlanStructure {
  const directResult = canonicalTrainingPlanStructureSchema.safeParse(planStructure);
  if (directResult.success) {
    return directResult.data;
  }

  const persisted = persistedTrainingPlanStructureSchema.parse(planStructure);
  const { id: _id, ...canonical } = persisted;
  return canonical;
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

/**
 * Materializes a training plan structure into deterministic event records.
 *
 * Accepts only canonical version-1 relative sessions (with an optional persisted id),
 * anchored exclusively to `startDate`.
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
  const canonicalStructure = getCanonicalStructure(planStructure);

  if (!isDateOnlyString(startDate)) {
    return [];
  }

  return materializeCanonicalPlan(canonicalStructure, startDate, planningTimeZone);
}
