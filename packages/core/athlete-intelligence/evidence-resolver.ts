import { fingerprintCanonicalJson, stringifyCanonicalJson } from "./canonical-json";
import {
  EVIDENCE_VERSION,
  type EvidenceCandidate,
  type EvidenceResolution,
  type EvidenceResolverPolicy,
  type EvidenceSet,
  evidenceResolutionSchema,
  evidenceResolverPolicySchema,
  evidenceSetSchema,
} from "./evidence";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function candidateId(candidate: EvidenceCandidate): string {
  return `${candidate.source}:${candidate.sourceId}@${candidate.observedAt}`;
}

function compareCandidates(left: EvidenceCandidate, right: EvidenceCandidate): number {
  return stringifyCanonicalJson(left).localeCompare(stringifyCanonicalJson(right));
}

function effectiveWeight(candidate: EvidenceCandidate, policy: EvidenceResolverPolicy): number {
  const ageDays = Math.max(
    0,
    (Date.parse(policy.asOf) - Date.parse(candidate.observedAt)) / MILLISECONDS_PER_DAY,
  );
  const freshness = 0.5 ** (ageDays / policy.freshnessHalfLifeDays);
  return candidate.weight * candidate.confidence * freshness;
}

function correlationKey(candidate: EvidenceCandidate): string {
  return candidate.correlationGroupId ?? `independent:${candidateId(candidate)}`;
}

function roundNormalized(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1_000_000) / 1_000_000;
}

/**
 * Resolves a capability using weighted continuous evidence. At most one candidate from
 * each correlation group is retained, so duplicate observations cannot raise confidence.
 */
export function resolveEvidenceSet(input: {
  evidenceSet: EvidenceSet;
  policy: EvidenceResolverPolicy;
}): EvidenceResolution {
  const evidenceSet = evidenceSetSchema.parse(input.evidenceSet);
  const policy = evidenceResolverPolicySchema.parse(input.policy);
  const candidates = [...evidenceSet.candidates].sort(compareCandidates);
  const known = candidates.filter((candidate) => candidate.value !== null);
  const unknown = candidates.filter((candidate) => candidate.value === null);
  const selectedByGroup = new Map<string, EvidenceCandidate>();

  for (const candidate of known) {
    const key = correlationKey(candidate);
    const current = selectedByGroup.get(key);
    if (!current) {
      selectedByGroup.set(key, candidate);
      continue;
    }

    const candidateWeight = effectiveWeight(candidate, policy);
    const currentWeight = effectiveWeight(current, policy);
    if (
      candidateWeight > currentWeight ||
      (candidateWeight === currentWeight && compareCandidates(candidate, current) < 0)
    ) {
      selectedByGroup.set(key, candidate);
    }
  }

  const selectedCandidates = [...selectedByGroup.values()].sort(compareCandidates);
  const selectedIds = selectedCandidates.map(candidateId);
  const selectedIdSet = new Set(selectedIds);
  const excludedCorrelatedCandidateIds = known
    .filter((candidate) => !selectedIdSet.has(candidateId(candidate)))
    .map(candidateId)
    .sort();
  const canonicalInput = {
    evidenceSet: { ...evidenceSet, candidates },
    policy,
  };
  const explanation = {
    inputFingerprint: fingerprintCanonicalJson(canonicalInput),
    candidateCount: candidates.length,
    knownCandidateCount: known.length,
    selectedCandidateIds: selectedIds,
    excludedCorrelatedCandidateIds,
    unknownCandidateIds: unknown.map(candidateId).sort(),
  };

  if (selectedCandidates.length === 0) {
    return evidenceResolutionSchema.parse({
      version: EVIDENCE_VERSION,
      capabilityId: evidenceSet.capabilityId,
      value: null,
      confidence: 0,
      status: "unknown",
      selectedCandidates: [],
      explanation,
    });
  }

  const weighted = selectedCandidates.map((candidate) => ({
    candidate,
    weight: effectiveWeight(candidate, policy),
  }));
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
  const value =
    totalWeight === 0
      ? null
      : roundNormalized(
          weighted.reduce((total, item) => total + (item.candidate.value ?? 0) * item.weight, 0) /
            totalWeight,
        );
  const confidence = roundNormalized(
    1 - weighted.reduce((remaining, item) => remaining * (1 - item.weight), 1),
  );

  return evidenceResolutionSchema.parse({
    version: EVIDENCE_VERSION,
    capabilityId: evidenceSet.capabilityId,
    value,
    confidence: value === null ? 0 : confidence,
    status: value === null ? "unknown" : "known",
    selectedCandidates,
    explanation,
  });
}
