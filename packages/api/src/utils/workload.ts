import {
  computeAcwr,
  computeMonotony,
  type LoadDayObservation,
  type LoadSeries,
  type LoadSeriesIdentity,
} from "@repo/core";

export type LoadSource = "trimp" | "tss" | "mixed" | "none";

export interface ActivityTssIdentity {
  sport: "run" | "bike" | "swim" | "strength" | "other";
  method: "power_threshold" | "run_pace_threshold" | "heart_rate_reserve";
  source: "activity_analysis";
  version: "1";
  calibration:
    | { type: "ftp_watts"; value: number }
    | { type: "threshold_speed_mps"; value: number }
    | { type: "heart_rate_reserve_bpm"; resting: number; maximum: number };
}

export interface CanonicalLoadActivity {
  started_at?: string | null;
  sport?: string | null;
  trimp?: number | null;
  tss?: number | null;
  training_stress_score?: number | null;
  tss_identity?: ActivityTssIdentity | null;
  load_method?: string | null;
  load_version?: string | null;
  load_source_definition?: string | null;
}

export interface CanonicalDailyLoads {
  /** Compatibility field. Empty when more than one identity is present. */
  dailyLoads: number[];
  coverageDays: number;
  source: LoadSource;
  series: LoadSeries[];
  exactIdentity: LoadSeriesIdentity | null;
  complete: boolean;
}

export interface WorkloadBuildOptions {
  /** Dates known to have complete capture and no load. Unknown dates must not be supplied here. */
  knownRestDates?: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeys(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  for (let time = startDate.getTime(); time <= endDate.getTime(); time += DAY_MS) {
    const key = new Date(time).toISOString().split("T")[0];
    if (key) keys.push(key);
  }
  return keys;
}

function identityKey(identity: LoadSeriesIdentity): string {
  return [
    identity.sport,
    identity.family,
    identity.method,
    identity.version,
    identity.sourceDefinition,
  ].join("\u0000");
}

function identityFor(
  activity: CanonicalLoadActivity,
  family: "trimp" | "tss",
): LoadSeriesIdentity | null {
  if (family === "tss" && activity.tss_identity) {
    return {
      sport: activity.tss_identity.sport,
      family,
      method: activity.tss_identity.method,
      version: activity.tss_identity.version,
      sourceDefinition: `${activity.tss_identity.source}:${JSON.stringify(activity.tss_identity.calibration)}`,
    };
  }
  const sport = activity.sport?.trim();
  const method = activity.load_method?.trim();
  const version = activity.load_version?.trim();
  const sourceDefinition = activity.load_source_definition?.trim();
  if (!sport || !method || !version || !sourceDefinition) return null;
  return {
    sport,
    family,
    method,
    version,
    sourceDefinition,
  };
}

export function buildCanonicalDailyLoads(
  activities: CanonicalLoadActivity[],
  startDate: Date,
  endDate: Date,
  options: WorkloadBuildOptions = {},
): CanonicalDailyLoads {
  const dates = dateKeys(startDate, endDate);
  const knownRestDates = new Set(options.knownRestDates ?? []);
  const grouped = new Map<
    string,
    { identity: LoadSeriesIdentity; valuesByDate: Map<string, number> }
  >();
  let complete = true;

  const add = (activity: CanonicalLoadActivity, family: "trimp" | "tss", value: number) => {
    const identity = identityFor(activity, family);
    if (!identity) {
      complete = false;
      return;
    }
    const key = identityKey(identity);
    const group = grouped.get(key) ?? { identity, valuesByDate: new Map<string, number>() };
    const date = activity.started_at
      ? new Date(activity.started_at).toISOString().split("T")[0]
      : undefined;
    if (!date || !dates.includes(date)) return;
    group.valuesByDate.set(date, (group.valuesByDate.get(date) ?? 0) + value);
    grouped.set(key, group);
  };

  for (const activity of activities) {
    if (!activity.started_at || Number.isNaN(new Date(activity.started_at).getTime())) continue;
    if (typeof activity.trimp === "number" && Number.isFinite(activity.trimp)) {
      add(activity, "trimp", Math.max(0, activity.trimp));
    }
    const tss = activity.tss ?? activity.training_stress_score;
    if (typeof tss === "number" && Number.isFinite(tss)) {
      add(activity, "tss", Math.max(0, tss));
    }
  }

  const series = [...grouped.values()].map(({ identity, valuesByDate }) => ({
    identity,
    observations: dates.map<LoadDayObservation>((date) => {
      const value = valuesByDate.get(date);
      if (value !== undefined) return { date, state: "observed", value };
      if (knownRestDates.has(date)) return { date, state: "known_zero", value: 0 };
      return { date, state: "unknown", value: null };
    }),
  }));
  const onlySeries = series.length === 1 ? series[0] : undefined;
  const families = new Set(series.map(({ identity }) => identity.family));

  return {
    dailyLoads: onlySeries?.observations.every(
      ({ state }) => state === "observed" || state === "known_zero",
    )
      ? onlySeries.observations.map(({ value }) => (typeof value === "number" ? value : 0))
      : [],
    coverageDays: onlySeries
      ? onlySeries.observations.filter(
          ({ state }) => state === "observed" || state === "known_zero",
        ).length
      : 0,
    source:
      series.length === 0
        ? "none"
        : families.size > 1
          ? "mixed"
          : (series[0]?.identity.family as "trimp" | "tss"),
    series,
    exactIdentity: complete && onlySeries ? onlySeries.identity : null,
    complete: complete && series.length === 1,
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
    const reason = canonical.series.length === 0 ? "missing_exact_identity" : "mixed_identities";
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
