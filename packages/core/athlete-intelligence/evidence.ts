import { z } from "zod";

export const EVIDENCE_VERSION = "1" as const;

const normalizedNumberSchema = z.number().min(0).max(1);

/**
 * Versioned lineage information supplied by a policy and its producing adapter.
 * Source names and sports intentionally remain extensible strings.
 */
export const evidenceProvenanceSchema = z
  .object({
    policyVersion: z.string().min(1),
    adapterVersion: z.string().min(1),
    lineage: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>;

/** A single normalized observation supporting (or leaving unknown) one capability. */
export const evidenceCandidateSchema = z
  .object({
    version: z.literal(EVIDENCE_VERSION),
    capabilityId: z.string().min(1),
    value: normalizedNumberSchema.nullable(),
    weight: normalizedNumberSchema,
    confidence: normalizedNumberSchema,
    observedAt: z.string().datetime(),
    source: z.string().min(1),
    sourceId: z.string().min(1),
    sport: z.string().min(1),
    correlationGroupId: z.string().min(1).nullable(),
    reasons: z.array(z.string().min(1)).default([]),
    provenance: evidenceProvenanceSchema,
  })
  .strict()
  .superRefine((candidate, ctx) => {
    if (candidate.value === null && candidate.confidence !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "Unknown evidence must have zero confidence",
        path: ["confidence"],
      });
    }
  });

export type EvidenceCandidate = z.infer<typeof evidenceCandidateSchema>;

/** All candidate observations offered for one continuous capability resolution. */
export const evidenceSetSchema = z
  .object({
    version: z.literal(EVIDENCE_VERSION),
    capabilityId: z.string().min(1),
    candidates: z.array(evidenceCandidateSchema),
  })
  .strict()
  .superRefine((evidenceSet, ctx) => {
    evidenceSet.candidates.forEach((candidate, index) => {
      if (candidate.capabilityId !== evidenceSet.capabilityId) {
        ctx.addIssue({
          code: "custom",
          message: "Each candidate capabilityId must match its evidence set",
          path: ["candidates", index, "capabilityId"],
        });
      }
    });
  });

export type EvidenceSet = z.infer<typeof evidenceSetSchema>;

export const evidenceResolutionStatusSchema = z.enum(["known", "unknown"]);
export type EvidenceResolutionStatus = z.infer<typeof evidenceResolutionStatusSchema>;

export const evidenceResolverPolicySchema = z
  .object({
    version: z.literal(EVIDENCE_VERSION),
    asOf: z.string().datetime(),
    freshnessHalfLifeDays: z.number().positive(),
  })
  .strict();

export type EvidenceResolverPolicy = z.infer<typeof evidenceResolverPolicySchema>;

export const evidenceResolutionExplanationSchema = z
  .object({
    inputFingerprint: z.string().min(1),
    candidateCount: z.number().int().nonnegative(),
    knownCandidateCount: z.number().int().nonnegative(),
    selectedCandidateIds: z.array(z.string().min(1)),
    excludedCorrelatedCandidateIds: z.array(z.string().min(1)),
    unknownCandidateIds: z.array(z.string().min(1)),
  })
  .strict();

export type EvidenceResolutionExplanation = z.infer<typeof evidenceResolutionExplanationSchema>;

export const evidenceResolutionSchema = z
  .object({
    version: z.literal(EVIDENCE_VERSION),
    capabilityId: z.string().min(1),
    value: normalizedNumberSchema.nullable(),
    confidence: normalizedNumberSchema,
    status: evidenceResolutionStatusSchema,
    selectedCandidates: z.array(evidenceCandidateSchema),
    explanation: evidenceResolutionExplanationSchema,
  })
  .strict()
  .superRefine((resolution, ctx) => {
    if (
      resolution.status === "unknown" &&
      (resolution.value !== null || resolution.confidence !== 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Unknown resolutions must have null value and zero confidence",
      });
    }
  });

export type EvidenceResolution = z.infer<typeof evidenceResolutionSchema>;
