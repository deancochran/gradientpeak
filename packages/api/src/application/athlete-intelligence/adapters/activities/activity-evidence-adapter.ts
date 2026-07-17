import { EVIDENCE_VERSION, type EvidenceCandidate } from "@repo/core";
import { activities, activitySegments } from "@repo/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../../../db";

const ACTIVITY_LOOKBACK_DAYS = 90;
const ACTIVITY_LIMIT = 120;
const TARGET_ACTIVE_WEEKS = 12;
const SECONDS_PER_HOUR = 60 * 60;

type Db = ReturnType<typeof getRequiredDb>;

type ActivityEvidenceRow = {
  id: string;
  activity_id: string;
  category: string;
  started_at: Date;
  start_offset_ms: number;
  duration_seconds: number | null;
};

export const activityEvidenceReadLimits = {
  lookbackDays: ACTIVITY_LOOKBACK_DAYS,
  limit: ACTIVITY_LIMIT,
} as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function round(value: number) {
  return Math.round(clamp01(value) * 1_000_000) / 1_000_000;
}

function startOfUtcWeek(value: Date) {
  return (
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) -
    ((value.getUTCDay() + 6) % 7) * 24 * SECONDS_PER_HOUR * 1000
  );
}

function observedCoverage(rows: ActivityEvidenceRow[]) {
  const activeWeeks = new Set(rows.map((row) => startOfUtcWeek(row.started_at)));
  return round(activeWeeks.size / TARGET_ACTIVE_WEEKS);
}

function candidate(input: {
  capabilityId: "endurance" | "durability" | "specificity";
  value: number | null;
  confidence: number;
  observedAt: Date;
  sourceId: string;
  sport: string;
  correlationGroupId: string | null;
  reasons: string[];
}): EvidenceCandidate {
  return {
    version: EVIDENCE_VERSION,
    capabilityId: input.capabilityId,
    value: input.value === null ? null : round(input.value),
    weight: input.value === null ? 0 : 1,
    confidence: input.value === null ? 0 : round(input.confidence),
    observedAt: input.observedAt.toISOString(),
    source: "activity_summary",
    sourceId: input.sourceId,
    sport: input.sport,
    correlationGroupId: input.correlationGroupId,
    reasons: input.reasons,
    provenance: {
      policyVersion: EVIDENCE_VERSION,
      adapterVersion: "activity-evidence-adapter/1",
      lineage: ["activities"],
    },
  };
}

function unknownCandidate(input: {
  capabilityId: "endurance" | "durability" | "specificity";
  now: Date;
  reason: string;
}) {
  return candidate({
    ...input,
    value: null,
    confidence: 0,
    sourceId: `activity-window:${input.capabilityId}`,
    sport: "unknown",
    correlationGroupId: null,
    reasons: [input.reason],
    observedAt: input.now,
  });
}

function compareCandidates(left: EvidenceCandidate, right: EvidenceCandidate) {
  return (
    left.capabilityId.localeCompare(right.capabilityId) ||
    right.observedAt.localeCompare(left.observedAt) ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

/**
 * Reads a bounded, profile-scoped activity window and translates its observed distribution
 * into independent activity evidence. Calendar size alone never increases coverage.
 */
export class ActivityEvidenceAdapter {
  constructor(private readonly db: Db) {}

  async collect(input: {
    profileId: string;
    goalActivityCategory?: string | null;
    now?: Date;
  }): Promise<EvidenceCandidate[]> {
    const now = input.now ?? new Date();
    const lookbackStart = new Date(now);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - ACTIVITY_LOOKBACK_DAYS);
    const rows = await this.db
      .select({
        id: activitySegments.id,
        activity_id: activities.id,
        category: activitySegments.category,
        started_at: activities.started_at,
        start_offset_ms: activitySegments.start_offset_ms,
        duration_seconds: sql<number | null>`case
          when ${activitySegments.timing_coverage} = 'unavailable' then null
          when ${activitySegments.active_ms} is not null then ${activitySegments.active_ms} / 1000.0
          when ${activitySegments.moving_ms} is not null then ${activitySegments.moving_ms} / 1000.0
          else null end`,
      })
      .from(activities)
      .innerJoin(
        activitySegments,
        and(eq(activitySegments.activity_id, activities.id), eq(activitySegments.role, "activity")),
      )
      .where(
        and(eq(activities.profile_id, input.profileId), gte(activities.started_at, lookbackStart)),
      )
      .orderBy(desc(activities.started_at), desc(activities.id))
      .limit(ACTIVITY_LIMIT);

    const usable = (rows as ActivityEvidenceRow[])
      .flatMap((row) =>
        row.duration_seconds !== null &&
        row.duration_seconds > 0 &&
        Number.isFinite(row.duration_seconds) &&
        !Number.isNaN(row.started_at.getTime())
          ? [
              {
                ...row,
                duration_seconds: row.duration_seconds,
                started_at: new Date(row.started_at.getTime() + row.start_offset_ms),
              },
            ]
          : [],
      )
      .sort(
        (left, right) =>
          right.started_at.getTime() - left.started_at.getTime() || left.id.localeCompare(right.id),
      );
    const coverage = observedCoverage(usable);
    const coverageReason = `Observed coverage is ${coverage} from ${new Set(usable.map((row) => startOfUtcWeek(row.started_at))).size} active weeks across ${usable.length} usable activities.`;
    const evidence: EvidenceCandidate[] = [];

    if (usable.length === 0) {
      evidence.push(
        unknownCandidate({
          capabilityId: "endurance",
          now,
          reason: "No usable recent activity duration is available for endurance evidence.",
        }),
        unknownCandidate({
          capabilityId: "durability",
          now,
          reason: "At least two usable recent activities are required for durability evidence.",
        }),
        unknownCandidate({
          capabilityId: "specificity",
          now,
          reason: input.goalActivityCategory
            ? "No usable recent activity supports the requested goal category."
            : "No goal activity category was supplied for specificity evidence.",
        }),
      );
      return evidence.sort(compareCandidates);
    }

    for (const row of usable) {
      const correlationGroupId = `activity:${row.activity_id}`;
      evidence.push(
        candidate({
          capabilityId: "endurance",
          value: row.duration_seconds / (3 * SECONDS_PER_HOUR),
          confidence: coverage * 0.7,
          observedAt: row.started_at,
          sourceId: row.id,
          sport: row.category,
          correlationGroupId,
          reasons: [coverageReason, "Activity duration supports endurance evidence."],
        }),
      );
    }

    if (usable.length < 2) {
      evidence.push(
        unknownCandidate({
          capabilityId: "durability",
          now,
          reason: "At least two usable recent activities are required for durability evidence.",
        }),
      );
    } else {
      for (const row of usable) {
        evidence.push(
          candidate({
            capabilityId: "durability",
            value: row.duration_seconds / (2 * SECONDS_PER_HOUR),
            confidence: coverage * 0.6,
            observedAt: row.started_at,
            sourceId: row.id,
            sport: row.category,
            correlationGroupId: `activity:${row.activity_id}`,
            reasons: [
              coverageReason,
              "Repeated activity distribution supports durability evidence.",
            ],
          }),
        );
      }
    }

    const matching = input.goalActivityCategory
      ? usable.filter((row) => row.category === input.goalActivityCategory)
      : [];
    if (!input.goalActivityCategory || matching.length === 0) {
      evidence.push(
        unknownCandidate({
          capabilityId: "specificity",
          now,
          reason: input.goalActivityCategory
            ? "No usable recent activity matches the goal activity category."
            : "No goal activity category was supplied for specificity evidence.",
        }),
      );
    } else {
      const matchingRatio = matching.length / usable.length;
      for (const row of matching) {
        evidence.push(
          candidate({
            capabilityId: "specificity",
            value: (row.duration_seconds / (2 * SECONDS_PER_HOUR)) * matchingRatio,
            confidence: coverage * 0.6,
            observedAt: row.started_at,
            sourceId: row.id,
            sport: row.category,
            correlationGroupId: `activity:${row.activity_id}`,
            reasons: [
              coverageReason,
              `${matching.length} of ${usable.length} usable activities match the goal category.`,
            ],
          }),
        );
      }
    }

    return evidence.sort(compareCandidates);
  }
}
