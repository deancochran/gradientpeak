import {
  type ActivityObservationQuantification,
  activityObservationQuantificationBundleSchema,
  aggregateObservations,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  computeAcwr,
  computeMonotony,
  DuplicateActivityQuantificationSubjectError,
  type LoadDayObservation,
  type LoadSeries,
  type LoadSeriesIdentity,
  loadSeriesIdentitySchema,
} from "@repo/core";
import { formatDateOnlyUtc } from "@repo/core/calendar";

export type LoadSource = "common_load" | "none";
type WorkloadRejectionReason =
  | "duplicate_subject"
  | "incompatible_common_load_identity"
  | "incomplete_common_load"
  | "missing_quantification";

export interface CanonicalLoadActivity {
  started_at?: string | null;
  /** Parsed at this read-model boundary so stale model/version identities fail closed. */
  observationQuantification?: unknown;
}

export interface CanonicalDailyLoads {
  coverageDays: number;
  source: LoadSource;
  series: LoadSeries[];
  exactIdentity: LoadSeriesIdentity | null;
  complete: boolean;
  rejectionReason: WorkloadRejectionReason | null;
}

export interface WorkloadBuildOptions {
  /** Dates known to have complete capture and no load. Unknown dates must not be supplied here. */
  knownRestDates?: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeys(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  for (let time = startDate.getTime(); time <= endDate.getTime(); time += DAY_MS) {
    keys.push(formatDateOnlyUtc(new Date(time)));
  }
  return keys;
}

function parseObservationMembers(
  activity: CanonicalLoadActivity,
):
  | { status: "available"; members: ActivityObservationQuantification[] }
  | { status: "unavailable"; reason: WorkloadRejectionReason } {
  const bundle = activityObservationQuantificationBundleSchema.safeParse(
    activity.observationQuantification,
  );
  if (!bundle.success) {
    return {
      status: "unavailable",
      reason: activity.observationQuantification
        ? "incompatible_common_load_identity"
        : "missing_quantification",
    };
  }
  if (bundle.data.members.length === 0) {
    return { status: "unavailable", reason: "missing_quantification" };
  }
  return { status: "available", members: bundle.data.members };
}

export function buildCanonicalDailyLoads(
  activities: CanonicalLoadActivity[],
  startDate: Date,
  endDate: Date,
  options: WorkloadBuildOptions = {},
): CanonicalDailyLoads {
  const dates = dateKeys(startDate, endDate);
  const dateSet = new Set(dates);
  const knownRestDates = new Set(options.knownRestDates ?? []);
  const membersByDate = new Map<string, ActivityObservationQuantification[]>();
  const allMembers: ActivityObservationQuantification[] = [];
  let complete = true;
  let rejectionReason: WorkloadRejectionReason | null = null;
  let sawCanonicalQuantification = false;

  const add = (activity: CanonicalLoadActivity) => {
    const parsed = parseObservationMembers(activity);
    if (parsed.status === "unavailable") {
      complete = false;
      rejectionReason ??= parsed.reason;
      return;
    }
    sawCanonicalQuantification = true;
    const date = activity.started_at ? formatDateOnlyUtc(new Date(activity.started_at)) : undefined;
    if (!date || !dateSet.has(date)) return;
    allMembers.push(...parsed.members);
    membersByDate.set(date, [...(membersByDate.get(date) ?? []), ...parsed.members]);
  };

  for (const activity of activities) {
    if (!activity.started_at || Number.isNaN(new Date(activity.started_at).getTime())) {
      complete = false;
      rejectionReason ??= "missing_quantification";
      continue;
    }
    add(activity);
  }

  try {
    if (allMembers.length > 0) aggregateObservations(allMembers);
  } catch (error) {
    if (!(error instanceof DuplicateActivityQuantificationSubjectError)) throw error;
    complete = false;
    rejectionReason = "duplicate_subject";
  }

  const valuesByDate = new Map<string, number>();
  if (rejectionReason !== "duplicate_subject") {
    for (const [date, members] of membersByDate) {
      const aggregate = aggregateObservations(members);
      const commonLoad = aggregate.commonLoad;
      if (
        commonLoad.model !== COMMON_RELATIVE_LOAD_MODEL ||
        commonLoad.version !== COMMON_RELATIVE_LOAD_VERSION
      ) {
        complete = false;
        rejectionReason ??= "incompatible_common_load_identity";
      } else if (commonLoad.status !== "complete") {
        complete = false;
        rejectionReason ??= "incomplete_common_load";
      } else {
        valuesByDate.set(date, commonLoad.load);
      }
    }
  }

  const identity = loadSeriesIdentitySchema.parse({
    activity_category: "all",
    family: "common_load",
    method: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sourceDefinition: COMMON_RELATIVE_LOAD_MODEL,
  });
  const series =
    valuesByDate.size === 0
      ? []
      : [
          {
            identity,
            observations: dates.map<LoadDayObservation>((date) => {
              const value = valuesByDate.get(date);
              if (value !== undefined) return { date, state: "observed", value };
              if (knownRestDates.has(date)) return { date, state: "known_zero", value: 0 };
              return { date, state: "unknown", value: null };
            }),
          },
        ];
  const onlySeries = series.length === 1 ? series[0] : undefined;
  return {
    coverageDays: onlySeries
      ? onlySeries.observations.filter(
          ({ state }) => state === "observed" || state === "known_zero",
        ).length
      : 0,
    source: series.length === 0 && !sawCanonicalQuantification ? "none" : "common_load",
    series,
    exactIdentity: complete && onlySeries ? onlySeries.identity : null,
    complete: complete && series.length === 1,
    rejectionReason,
  };
}

function unavailable(
  requiredDays: number,
  reasonCode: string,
  source: LoadSource,
): {
  value: null;
  status: "insufficient_history";
  coverageDays: number;
  requiredDays: number;
  reasonCode: string;
  source: LoadSource;
  identity?: LoadSeriesIdentity;
} {
  return {
    value: null,
    status: "insufficient_history" as const,
    coverageDays: 0,
    requiredDays,
    reasonCode,
    source,
  };
}

export function buildWorkloadEnvelopes(
  activities: CanonicalLoadActivity[],
  startDate: Date,
  endDate: Date,
  options: WorkloadBuildOptions = {},
) {
  const canonical = buildCanonicalDailyLoads(activities, startDate, endDate, options);
  if (!canonical.complete || canonical.series.length !== 1) {
    const reason =
      canonical.rejectionReason ??
      (canonical.series.length === 0 ? "missing_quantification" : "mixed_identities");
    return {
      acwr: unavailable(28, reason, canonical.source),
      monotony: unavailable(7, reason, canonical.source),
    };
  }

  const [series] = canonical.series;
  if (!series) {
    return {
      acwr: unavailable(28, "no_load_data", "none"),
      monotony: unavailable(7, "no_load_data", "none"),
    };
  }
  return {
    acwr: {
      ...computeAcwr(series),
      source: canonical.source,
      identity: canonical.exactIdentity,
      coverageComplete: canonical.complete,
    },
    monotony: {
      ...computeMonotony(series),
      source: canonical.source,
      identity: canonical.exactIdentity,
      coverageComplete: canonical.complete,
    },
  };
}
