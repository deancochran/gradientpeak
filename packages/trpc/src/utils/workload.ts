import { computeAcwr, computeMonotony } from "@repo/core";

export type LoadSource = "trimp" | "tss" | "mixed" | "none";

export interface CanonicalLoadActivity {
  started_at?: string | null;
  trimp?: number | null;
  tss?: number | null;
  training_stress_score?: number | null;
}

export interface CanonicalDailyLoads {
  dailyLoads: number[];
  coverageDays: number;
  source: LoadSource;
}

export function buildCanonicalDailyLoads(
  activities: CanonicalLoadActivity[],
  startDate: Date,
  endDate: Date,
): CanonicalDailyLoads {
  const loadsByDate = new Map<string, number>();
  let trimpCount = 0;
  let tssCount = 0;
  let earliestActivityDate: Date | null = null;

  for (const activity of activities) {
    if (!activity.started_at) continue;
    const activityDate = new Date(activity.started_at);
    if (Number.isNaN(activityDate.getTime())) continue;

    if (!earliestActivityDate || activityDate < earliestActivityDate) {
      earliestActivityDate = activityDate;
    }

    const dateKey = activityDate.toISOString().split("T")[0];
    if (!dateKey) continue;

    const trimp =
      typeof activity.trimp === "number" && Number.isFinite(activity.trimp) ? activity.trimp : null;
    const tssCandidate = activity.tss ?? activity.training_stress_score;
    const tss =
      typeof tssCandidate === "number" && Number.isFinite(tssCandidate) ? tssCandidate : null;

    const load = trimp ?? tss ?? 0;
    if (trimp !== null) {
      trimpCount += 1;
    } else if (tss !== null) {
      tssCount += 1;
    }

    loadsByDate.set(dateKey, (loadsByDate.get(dateKey) ?? 0) + load);
  }

  const dailyLoads: number[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateKey = cursor.toISOString().split("T")[0];
    dailyLoads.push(dateKey ? (loadsByDate.get(dateKey) ?? 0) : 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  let source: LoadSource = "none";
  if (trimpCount > 0 && tssCount > 0) {
    source = "mixed";
  } else if (trimpCount > 0) {
    source = "trimp";
  } else if (tssCount > 0) {
    source = "tss";
  }

  return {
    dailyLoads,
    coverageDays: earliestActivityDate
      ? Math.max(
          0,
          Math.min(
            dailyLoads.length,
            Math.floor(
              (endDate.getTime() - earliestActivityDate.getTime()) / (1000 * 60 * 60 * 24),
            ) + 1,
          ),
        )
      : 0,
    source,
  };
}

export function buildWorkloadEnvelopes(
  activities: CanonicalLoadActivity[],
  startDate: Date,
  endDate: Date,
) {
  const canonicalLoads = buildCanonicalDailyLoads(activities, startDate, endDate);

  return {
    acwr: {
      ...computeAcwr(canonicalLoads.dailyLoads, canonicalLoads.coverageDays),
      source: canonicalLoads.source,
    },
    monotony: {
      ...computeMonotony(canonicalLoads.dailyLoads, canonicalLoads.coverageDays),
      source: canonicalLoads.source,
    },
  };
}
