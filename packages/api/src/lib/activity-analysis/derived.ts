import { type ActivityListDerivedSummary, analyzeActivityDerivedMetrics } from "@repo/core";
import type { ActivityRow } from "@repo/db";
import type { ActivityAnalysisStore } from "../../repositories";
import { resolveActivityContextFromEvidence } from "./context";

type ActivitySummaryRow = Omit<
  Pick<
    ActivityRow,
    | "id"
    | "type"
    | "started_at"
    | "finished_at"
    | "duration_seconds"
    | "moving_seconds"
    | "distance_meters"
    | "avg_heart_rate"
    | "max_heart_rate"
    | "avg_power"
    | "max_power"
    | "avg_speed_mps"
    | "max_speed_mps"
    | "normalized_power"
    | "normalized_speed_mps"
    | "normalized_graded_speed_mps"
  >,
  "started_at" | "finished_at"
> & {
  profile_id?: ActivityRow["profile_id"];
  started_at: Date | string;
  finished_at: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function buildActivityDerivedSummaryMap(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivitySummaryRow[];
}): Promise<Map<string, ActivityListDerivedSummary>> {
  const { store, profileId, activities } = input;
  if (activities.length === 0) return new Map();

  const requests = activities.map((activity) => ({
    asOf:
      activity.finished_at instanceof Date ? activity.finished_at : new Date(activity.finished_at),
    profileId: activity.profile_id ?? profileId,
  }));
  let evidenceByProfileId = new Map<
    string,
    Awaited<ReturnType<ActivityAnalysisStore["getContextSnapshot"]>>
  >();
  const legacyEvidenceByRequest = new Map<
    string,
    Awaited<ReturnType<ActivityAnalysisStore["getContextSnapshot"]>>
  >();
  if (store.loadContextEvidence) {
    evidenceByProfileId = await store.loadContextEvidence({ requests });
  } else {
    for (let offset = 0; offset < requests.length; offset += 16) {
      const batch = requests.slice(offset, offset + 16);
      const snapshots = await Promise.all(
        batch.map((request) => store.getContextSnapshot(request)),
      );
      for (let index = 0; index < batch.length; index += 1) {
        const request = batch[index];
        const snapshot = snapshots[index];
        if (!request || !snapshot) continue;
        legacyEvidenceByRequest.set(contextRequestKey(request), snapshot);
      }
    }
  }
  const derivedEntries: Array<readonly [string, ActivityListDerivedSummary]> = [];

  // Derivation is CPU-only after the single set-based evidence load. Keeping this loop
  // synchronous avoids enqueueing hundreds of promises for full-history TSS scans.
  for (const activity of activities) {
    const activityAsOf =
      activity.finished_at instanceof Date ? activity.finished_at : new Date(activity.finished_at);
    const activityProfileId = activity.profile_id ?? profileId;
    const evidence = (store.loadContextEvidence
      ? evidenceByProfileId.get(activityProfileId)
      : legacyEvidenceByRequest.get(
          contextRequestKey({ asOf: activityAsOf, profileId: activityProfileId }),
        )) ?? {
      profile: { dob: null, gender: null },
      profileMetrics: [],
      recentEfforts: [],
    };
    const context = resolveActivityContextFromEvidence({
      evidence,
      activityTimestamp: activityAsOf,
    });

    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: activity.id,
        type: activity.type,
        started_at: toIsoString(activity.started_at),
        finished_at: toIsoString(activity.finished_at),
        duration_seconds: activity.duration_seconds,
        moving_seconds: activity.moving_seconds,
        distance_meters: activity.distance_meters,
        avg_heart_rate: activity.avg_heart_rate,
        max_heart_rate: activity.max_heart_rate,
        avg_power: activity.avg_power,
        max_power: activity.max_power,
        avg_speed_mps: activity.avg_speed_mps,
        max_speed_mps: activity.max_speed_mps,
        normalized_power: activity.normalized_power,
        normalized_speed_mps: activity.normalized_speed_mps,
        normalized_graded_speed_mps: activity.normalized_graded_speed_mps,
      },
      context,
    });

    derivedEntries.push([
      activity.id,
      {
        tss: derived.stress.tss,
        tss_identity: derived.stress.tss_identity,
        intensity_factor: derived.stress.intensity_factor,
        computed_as_of: derived.computed_as_of,
      } satisfies ActivityListDerivedSummary,
    ] as const);
  }

  return new Map(derivedEntries);
}

function contextRequestKey(input: { asOf: Date; profileId: string }): string {
  return `${input.profileId}\u0000${input.asOf.toISOString()}`;
}

export async function buildDynamicStressSeries(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivitySummaryRow[];
}): Promise<{
  byActivityId: Map<string, ActivityListDerivedSummary>;
  byDate: Map<string, number>;
  seriesIdentity: ActivityListDerivedSummary["tss_identity"];
  complete: boolean;
}> {
  const byActivityId = await buildActivityDerivedSummaryMap(input);
  const byDate = new Map<string, number>();
  const identities = new Map<string, NonNullable<ActivityListDerivedSummary["tss_identity"]>>();
  let complete = true;

  for (const activity of input.activities) {
    const dateKey = toIsoString(activity.started_at).split("T")[0];
    if (!dateKey) continue;
    const summary = byActivityId.get(activity.id);
    if (summary?.tss === null || !summary?.tss_identity) {
      complete = false;
      continue;
    }
    const identityKey = JSON.stringify(summary.tss_identity);
    identities.set(identityKey, summary.tss_identity);
    const tss = summary.tss;
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + tss);
  }

  const seriesIdentity = identities.size === 1 ? [...identities.values()][0]! : null;
  return { byActivityId, byDate, seriesIdentity, complete: complete && seriesIdentity !== null };
}
