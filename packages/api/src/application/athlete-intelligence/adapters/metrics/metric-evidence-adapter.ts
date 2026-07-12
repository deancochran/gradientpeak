import { EVIDENCE_VERSION, type EvidenceCandidate } from "@repo/core";
import { profileMetrics } from "@repo/db";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { getRequiredDb } from "../../../../db";

const DAY_MS = 24 * 60 * 60 * 1000;

export const supportedMetricInputTypes = ["ftp", "lthr", "vo2_max", "weight_kg"] as const;
export type SupportedMetricInputType = (typeof supportedMetricInputTypes)[number];

type MetricSpecification = {
  canonicalUnit: string;
};

const metricSpecifications: Record<SupportedMetricInputType, MetricSpecification> = {
  ftp: { canonicalUnit: "W" },
  lthr: { canonicalUnit: "bpm" },
  vo2_max: { canonicalUnit: "ml/kg/min" },
  weight_kg: { canonicalUnit: "kg" },
};

type ProfileMetricRow = {
  id: string;
  profile_id: string;
  metric_type: string;
  recorded_at: Date;
  unit: string;
  value: number;
  reference_activity_id: string | null;
};

export type MetricEvidencePolicy = {
  asOf: Date;
  freshnessHalfLifeDays: number;
  weight: number;
  confidence: number;
  provenance: {
    policyVersion: string;
    adapterVersion: string;
    lineage: string[];
  };
};

export type MetricEvidence = {
  metricType: string;
  canonicalUnit: string | null;
  canonicalValue: number | null;
  referenceActivityId: string | null;
  candidate: EvidenceCandidate;
};

function isSupportedMetricInputType(value: string): value is SupportedMetricInputType {
  return (supportedMetricInputTypes as readonly string[]).includes(value);
}

function roundNormalized(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1_000_000) / 1_000_000;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function compareRows(left: ProfileMetricRow, right: ProfileMetricRow): number {
  const recordedAtDifference = right.recorded_at.getTime() - left.recorded_at.getTime();
  return recordedAtDifference || left.id.localeCompare(right.id);
}

/**
 * Adapts persisted metric observations into availability evidence only. It deliberately
 * does not infer physiology, goals, or capabilities from the raw metric values.
 */
export class MetricEvidenceAdapter {
  constructor(private readonly db: ReturnType<typeof getRequiredDb>) {}

  async read(input: {
    profileId: string;
    metricTypes?: readonly string[];
    policy: MetricEvidencePolicy;
  }): Promise<MetricEvidence[]> {
    const requestedTypes = [...new Set(input.metricTypes ?? supportedMetricInputTypes)].sort();
    const policy = this.validatePolicy(input.policy);
    const supportedRequestedTypes = requestedTypes.filter(isSupportedMetricInputType);

    const rows = supportedRequestedTypes.length
      ? await this.readRows({
          profileId: input.profileId,
          metricTypes: supportedRequestedTypes,
          asOf: policy.asOf,
        })
      : [];
    const latestRows = new Map<string, ProfileMetricRow>();

    for (const row of rows
      .filter(
        (row) =>
          row.profile_id === input.profileId && row.recorded_at.getTime() <= policy.asOf.getTime(),
      )
      .sort(compareRows)) {
      if (!latestRows.has(row.metric_type)) latestRows.set(row.metric_type, row);
    }

    return requestedTypes.map((metricType) => {
      if (!isSupportedMetricInputType(metricType)) {
        return this.unknownEvidence({
          metricType,
          policy,
          profileId: input.profileId,
          reason: "metric_type_unsupported",
        });
      }

      const row = latestRows.get(metricType);
      if (!row) {
        return this.unknownEvidence({
          metricType,
          policy,
          profileId: input.profileId,
          reason: "metric_absent_as_of",
        });
      }

      const specification = metricSpecifications[metricType];
      if (row.unit !== specification.canonicalUnit) {
        return this.unknownEvidence({
          metricType,
          policy,
          profileId: input.profileId,
          row,
          reason: "metric_unit_not_canonical",
        });
      }

      if (!Number.isFinite(row.value) || row.value <= 0) {
        return this.unknownEvidence({
          metricType,
          policy,
          profileId: input.profileId,
          row,
          reason: "metric_value_invalid",
        });
      }

      const ageDays = Math.max(0, (policy.asOf.getTime() - row.recorded_at.getTime()) / DAY_MS);
      const freshness = 0.5 ** (ageDays / policy.freshnessHalfLifeDays);
      const observedAt = toIso(row.recorded_at);
      const referenceReason = row.reference_activity_id
        ? [`reference_activity:${row.reference_activity_id}`]
        : [];

      return {
        metricType,
        canonicalUnit: specification.canonicalUnit,
        canonicalValue: row.value,
        referenceActivityId: row.reference_activity_id,
        candidate: {
          version: EVIDENCE_VERSION,
          capabilityId: `metric_input:${metricType}`,
          // This is availability evidence, not a normalized physiology assertion.
          value: 1,
          weight: policy.weight,
          confidence: roundNormalized(policy.confidence * freshness),
          observedAt,
          source: row.reference_activity_id
            ? "profile_metrics:reference_activity"
            : "profile_metrics",
          sourceId: row.id,
          sport: "unknown",
          correlationGroupId: `profile_metric:${metricType}:${row.reference_activity_id ?? row.id}`,
          reasons: [
            "metric_available",
            `metric_unit:${specification.canonicalUnit}`,
            ...referenceReason,
          ],
          provenance: policy.provenance,
        },
      };
    });
  }

  private async readRows(input: {
    profileId: string;
    metricTypes: readonly SupportedMetricInputType[];
    asOf: Date;
  }): Promise<ProfileMetricRow[]> {
    return this.db
      .select({
        id: profileMetrics.id,
        profile_id: profileMetrics.profile_id,
        metric_type: profileMetrics.metric_type,
        recorded_at: profileMetrics.recorded_at,
        unit: profileMetrics.unit,
        value: profileMetrics.value,
        reference_activity_id: profileMetrics.reference_activity_id,
      })
      .from(profileMetrics)
      .where(
        and(
          eq(profileMetrics.profile_id, input.profileId),
          inArray(profileMetrics.metric_type, input.metricTypes),
          lte(profileMetrics.recorded_at, input.asOf),
        ),
      )
      .orderBy(desc(profileMetrics.recorded_at)) as Promise<ProfileMetricRow[]>;
  }

  private unknownEvidence(input: {
    metricType: string;
    profileId: string;
    policy: MetricEvidencePolicy;
    reason: string;
    row?: ProfileMetricRow;
  }): MetricEvidence {
    const observedAt = toIso(input.row?.recorded_at ?? input.policy.asOf);
    const sourceId = input.row?.id ?? `absent:${input.profileId}:${input.metricType}:${observedAt}`;

    return {
      metricType: input.metricType,
      canonicalUnit: isSupportedMetricInputType(input.metricType)
        ? metricSpecifications[input.metricType].canonicalUnit
        : null,
      canonicalValue: null,
      referenceActivityId: input.row?.reference_activity_id ?? null,
      candidate: {
        version: EVIDENCE_VERSION,
        capabilityId: `metric_input:${input.metricType}`,
        value: null,
        weight: input.policy.weight,
        confidence: 0,
        observedAt,
        source: input.row?.reference_activity_id
          ? "profile_metrics:reference_activity"
          : "profile_metrics",
        sourceId,
        sport: "unknown",
        correlationGroupId: `profile_metric:${input.metricType}:${input.row?.reference_activity_id ?? sourceId}`,
        reasons: [input.reason],
        provenance: input.policy.provenance,
      },
    };
  }

  private validatePolicy(policy: MetricEvidencePolicy): MetricEvidencePolicy {
    if (!Number.isFinite(policy.freshnessHalfLifeDays) || policy.freshnessHalfLifeDays <= 0) {
      throw new RangeError("freshnessHalfLifeDays must be positive");
    }
    if (!Number.isFinite(policy.weight) || policy.weight < 0 || policy.weight > 1) {
      throw new RangeError("weight must be between zero and one");
    }
    if (!Number.isFinite(policy.confidence) || policy.confidence < 0 || policy.confidence > 1) {
      throw new RangeError("confidence must be between zero and one");
    }
    return policy;
  }
}
