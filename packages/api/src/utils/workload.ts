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
import {
  addDaysDateOnlyUtc,
  getCalendarDateInIanaZone,
  isValidIanaTimeZone,
} from "@repo/core/calendar";
import { z } from "zod";

export type LoadSource = "common_load" | "none";
type WorkloadRejectionReason =
  | "duplicate_subject"
  | "incompatible_common_load_identity"
  | "missing_quantification"
  | "source_integrity_unavailable";

export type ActivitySourceIntegrity = "trusted" | "missing" | "invalid";

export type ActivitySourceEvidence = {
  currentArtifactIds: readonly string[];
  providerReferences: ReadonlyArray<{ provider: string; externalId: string }>;
};

export interface CanonicalLoadActivity {
  started_at?: string | null;
  /** Derived from persisted current source links or provider source references. */
  sourceIntegrity?: ActivitySourceIntegrity;
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
  /** Profile-local calendar zone. UTC is the deterministic compatibility default. */
  planningTimezone?: string;
}

const strictActivityTimestampSchema = z.string().datetime({ offset: true });

export function resolveActivitySourceIntegrity(input: {
  evidence: ActivitySourceEvidence;
  observationQuantification: unknown;
}): ActivitySourceIntegrity {
  const artifactCount = input.evidence.currentArtifactIds.length;
  const providerCount = input.evidence.providerReferences.length;
  if (artifactCount === 0 && providerCount === 0) return "missing";
  // A trusted source is one unambiguous persisted binding. Validate this before
  // inspecting quantification because absent or malformed quantification must
  // never turn mixed/multiple source evidence into a trusted known zero.
  if ((artifactCount > 0 && providerCount > 0) || artifactCount > 1 || providerCount > 1) {
    return "invalid";
  }

  const bundle = activityObservationQuantificationBundleSchema.safeParse(
    input.observationQuantification,
  );
  // Source integrity and quantification compatibility are separate gates. The
  // workload parser remains responsible for rejecting malformed identities.
  if (!bundle.success) return "trusted";

  for (const member of bundle.data.members) {
    const provenance = member.completedProvenance;
    if (provenance.source === "activity_file") {
      if (
        provenance.artifactIdentity === null ||
        input.evidence.currentArtifactIds.length !== 1 ||
        input.evidence.providerReferences.length !== 0 ||
        input.evidence.currentArtifactIds[0] !== provenance.artifactIdentity
      ) {
        return "invalid";
      }
    } else if (provenance.source === "provider_summary") {
      const identity = provenance.providerIdentity;
      if (
        identity === null ||
        identity.externalId === null ||
        input.evidence.currentArtifactIds.length !== 0 ||
        input.evidence.providerReferences.length !== 1 ||
        input.evidence.providerReferences[0]?.provider !== identity.provider ||
        input.evidence.providerReferences[0]?.externalId !== identity.externalId
      ) {
        return "invalid";
      }
    } else {
      // Recording and unknown provenance have no persisted source binding at
      // this read boundary, so they must never be treated as trusted.
      return "invalid";
    }
  }
  return "trusted";
}

function planningTimezone(options: WorkloadBuildOptions): string {
  const timezone = options.planningTimezone ?? "UTC";
  if (!isValidIanaTimeZone(timezone)) {
    throw new RangeError("planningTimezone must be a valid IANA zone");
  }
  return timezone;
}

function dateKeys(startDate: Date, endDate: Date, timezone: string): string[] {
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    throw new RangeError("workload date bounds must be valid instants");
  }
  const start = getCalendarDateInIanaZone(startDate.toISOString(), timezone);
  const end = getCalendarDateInIanaZone(endDate.toISOString(), timezone);
  const keys: string[] = [];
  for (let date = start; date <= end; date = addDaysDateOnlyUtc(date, 1)) {
    keys.push(date);
  }
  return keys;
}

function parseObservationMembers(
  activity: CanonicalLoadActivity,
):
  | { status: "available"; members: ActivityObservationQuantification[] }
  | { status: "known_zero" }
  | { status: "unavailable"; reason: WorkloadRejectionReason } {
  if (activity.sourceIntegrity !== "trusted") {
    return { status: "unavailable", reason: "source_integrity_unavailable" };
  }
  if (activity.observationQuantification == null) {
    return { status: "known_zero" };
  }
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
    return { status: "known_zero" };
  }
  return { status: "available", members: bundle.data.members };
}

export function buildCanonicalDailyLoads(
  activities: CanonicalLoadActivity[],
  startDate: Date,
  endDate: Date,
  options: WorkloadBuildOptions = {},
): CanonicalDailyLoads {
  const timezone = planningTimezone(options);
  const dates = dateKeys(startDate, endDate, timezone);
  const dateSet = new Set(dates);
  const knownRestDates = new Set(options.knownRestDates ?? []);
  const knownZeroDates = new Set<string>();
  const membersByDate = new Map<string, ActivityObservationQuantification[]>();
  const allMembers: ActivityObservationQuantification[] = [];
  let complete = true;
  let rejectionReason: WorkloadRejectionReason | null = null;
  let sawCanonicalQuantification = false;

  const add = (activity: CanonicalLoadActivity, date: string) => {
    const parsed = parseObservationMembers(activity);
    if (parsed.status === "known_zero") {
      knownZeroDates.add(date);
      return;
    }
    if (parsed.status === "unavailable") {
      complete = false;
      rejectionReason ??= parsed.reason;
      return;
    }
    sawCanonicalQuantification = true;
    allMembers.push(...parsed.members);
    membersByDate.set(date, [...(membersByDate.get(date) ?? []), ...parsed.members]);
  };

  for (const activity of activities) {
    const timestamp = strictActivityTimestampSchema.safeParse(activity.started_at);
    if (!timestamp.success) {
      complete = false;
      rejectionReason ??= "missing_quantification";
      continue;
    }
    const date = getCalendarDateInIanaZone(timestamp.data, timezone);
    if (!dateSet.has(date)) continue;
    add(activity, date);
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
        knownZeroDates.add(date);
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
    valuesByDate.size === 0 && knownZeroDates.size === 0
      ? []
      : [
          {
            identity,
            observations: dates.map<LoadDayObservation>((date) => {
              const value = valuesByDate.get(date);
              if (value !== undefined) return { date, state: "observed", value };
              if (knownZeroDates.has(date)) return { date, state: "known_zero", value: 0 };
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
