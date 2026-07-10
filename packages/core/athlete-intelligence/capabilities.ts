import { z } from "zod";
import { fingerprintCanonicalJson } from "./canonical-json";
import {
  ATHLETE_INTELLIGENCE_VERSION,
  type CapabilityAssessment,
  type CapabilityEvidence,
  capabilityAssessmentSchema,
  type IntelligenceDimension,
  intelligenceDimensions,
} from "./contracts";

const activityEvidenceSchema = z
  .object({
    type: z.string().min(1),
    startedAt: z.string().datetime(),
    durationSeconds: z.number().nonnegative(),
    distanceMeters: z.number().nonnegative(),
    maxPower: z.number().positive().nullable().optional(),
    maxSpeedMps: z.number().positive().nullable().optional(),
    avgSwolf: z.number().positive().nullable().optional(),
  })
  .strict();

const metricEvidenceSchema = z
  .object({
    metricType: z.enum(["ftp", "vo2_max"]),
    recordedAt: z.string().datetime(),
    value: z.number().positive(),
  })
  .strict();

export const capabilityAssessmentInputSchema = z
  .object({
    athleteId: z.string().min(1),
    assessedAt: z.string().datetime(),
    goalActivityCategory: z.string().min(1).nullable().optional(),
    activities: z.array(activityEvidenceSchema),
    metrics: z.array(metricEvidenceSchema),
  })
  .strict();

export type CapabilityAssessmentInput = z.infer<typeof capabilityAssessmentInputSchema>;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function round(value: number) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function evidence(input: {
  value: number | null;
  assessedAt: string;
  fingerprint: string;
  reason: string;
  confidence: number;
}): CapabilityEvidence {
  const hasEvidence = input.value !== null;
  const score = hasEvidence ? round(input.confidence) : 0;

  return {
    value: input.value === null ? null : round(input.value),
    confidence: {
      score,
      level: score >= 0.7 ? "high" : score >= 0.35 ? "medium" : "low",
      reasons: [input.reason],
    },
    provenance: {
      source: "capability_assessment",
      asOf: input.assessedAt,
      inputFingerprint: input.fingerprint,
      notes: hasEvidence ? [] : ["No direct evidence was available for this dimension."],
    },
  };
}

function latestMetric(input: CapabilityAssessmentInput, metricType: "ftp" | "vo2_max") {
  return input.metrics
    .filter((metric) => metric.metricType === metricType)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
}

/**
 * Creates a bounded, deliberately conservative capability assessment from request-time
 * activity summaries and profile metrics. Unsupported signals remain unknown, never zero.
 */
export function assessCapabilities(input: CapabilityAssessmentInput): CapabilityAssessment {
  const parsed = capabilityAssessmentInputSchema.parse(input);
  const fingerprint = fingerprintCanonicalJson(parsed);
  const totalDurationSeconds = parsed.activities.reduce(
    (total, activity) => total + activity.durationSeconds,
    0,
  );
  const longestDurationSeconds = Math.max(
    0,
    ...parsed.activities.map((activity) => activity.durationSeconds),
  );
  const thresholdMetric = latestMetric(parsed, "ftp") ?? latestMetric(parsed, "vo2_max");
  const peakPower = Math.max(0, ...parsed.activities.map((activity) => activity.maxPower ?? 0));
  const peakSpeed = Math.max(0, ...parsed.activities.map((activity) => activity.maxSpeedMps ?? 0));
  const swimWithSwolf = parsed.activities.filter((activity) => activity.avgSwolf != null);
  const matchingActivities = parsed.goalActivityCategory
    ? parsed.activities.filter((activity) => activity.type === parsed.goalActivityCategory)
    : [];

  const values: Record<IntelligenceDimension, CapabilityEvidence> = {
    endurance: evidence({
      value: parsed.activities.length === 0 ? null : totalDurationSeconds / (20 * 60 * 60),
      assessedAt: parsed.assessedAt,
      fingerprint,
      reason: `${parsed.activities.length} bounded activity summaries support endurance evidence.`,
      confidence: Math.min(0.7, parsed.activities.length / 12),
    }),
    threshold: evidence({
      value:
        thresholdMetric?.metricType === "ftp"
          ? thresholdMetric.value / 400
          : thresholdMetric?.metricType === "vo2_max"
            ? thresholdMetric.value / 70
            : null,
      assessedAt: parsed.assessedAt,
      fingerprint,
      reason: thresholdMetric
        ? `Latest ${thresholdMetric.metricType} metric provides threshold evidence.`
        : "No FTP or VO₂ max metric is available.",
      confidence: thresholdMetric ? 0.45 : 0,
    }),
    high_intensity: evidence({
      value: peakPower > 0 ? peakPower / 800 : peakSpeed > 0 ? peakSpeed / 12 : null,
      assessedAt: parsed.assessedAt,
      fingerprint,
      reason:
        peakPower > 0 || peakSpeed > 0
          ? "Activity summary peak data provides limited high-intensity evidence."
          : "No indexed peak activity-summary signal is available; efforts are intentionally not read.",
      confidence: peakPower > 0 || peakSpeed > 0 ? 0.3 : 0,
    }),
    durability: evidence({
      value:
        parsed.activities.length < 2
          ? null
          : Math.max(totalDurationSeconds / (30 * 60 * 60), longestDurationSeconds / (3 * 60 * 60)),
      assessedAt: parsed.assessedAt,
      fingerprint,
      reason:
        parsed.activities.length < 2
          ? "At least two activity summaries are required for durability evidence."
          : "Repeated and longer activity summaries support durability evidence.",
      confidence: parsed.activities.length < 2 ? 0 : Math.min(0.55, parsed.activities.length / 16),
    }),
    technical: evidence({
      value: swimWithSwolf.length === 0 ? null : swimWithSwolf.length / 12,
      assessedAt: parsed.assessedAt,
      fingerprint,
      reason:
        swimWithSwolf.length === 0
          ? "No technical activity-summary signal is available."
          : "Swim efficiency summaries provide limited technical evidence.",
      confidence: swimWithSwolf.length === 0 ? 0 : Math.min(0.35, swimWithSwolf.length / 12),
    }),
    specificity: evidence({
      value:
        !parsed.goalActivityCategory || matchingActivities.length === 0
          ? null
          : (matchingActivities.length / parsed.activities.length) *
            Math.min(1, matchingActivities.length / 6),
      assessedAt: parsed.assessedAt,
      fingerprint,
      reason: !parsed.goalActivityCategory
        ? "No goal activity category was supplied."
        : matchingActivities.length === 0
          ? "No activity summaries match the goal activity category."
          : "Goal-category activity summaries support specificity evidence.",
      confidence:
        matchingActivities.length === 0 ? 0 : Math.min(0.6, matchingActivities.length / 10),
    }),
  };

  const known = intelligenceDimensions.filter((dimension) => values[dimension].value !== null);
  const confidenceScore =
    known.length === 0 ? 0 : round(known.length / intelligenceDimensions.length / 2);

  return capabilityAssessmentSchema.parse({
    version: ATHLETE_INTELLIGENCE_VERSION,
    athleteId: parsed.athleteId,
    assessedAt: parsed.assessedAt,
    capabilities: values,
    confidence: {
      score: confidenceScore,
      level: confidenceScore >= 0.7 ? "high" : confidenceScore >= 0.35 ? "medium" : "low",
      reasons:
        known.length === intelligenceDimensions.length
          ? ["All canonical dimensions have bounded request-time evidence."]
          : [
              `${known.length} of ${intelligenceDimensions.length} canonical dimensions have evidence.`,
            ],
    },
    provenance: {
      source: "capability_assessment",
      asOf: parsed.assessedAt,
      inputFingerprint: fingerprint,
      notes: ["Assessment uses bounded activity summaries and selected profile metrics only."],
    },
  });
}
