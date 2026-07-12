import { describe, expect, it } from "vitest";
import {
  EVIDENCE_VERSION,
  type EvidenceCandidate,
  type EvidenceResolverPolicy,
  resolveEvidenceSet,
} from "..";

const policy: EvidenceResolverPolicy = {
  version: EVIDENCE_VERSION,
  asOf: "2026-07-10T00:00:00.000Z",
  freshnessHalfLifeDays: 10,
};

function candidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    version: EVIDENCE_VERSION,
    capabilityId: "threshold",
    value: 0.5,
    weight: 1,
    confidence: 1,
    observedAt: policy.asOf,
    source: "test_adapter",
    sourceId: "candidate-1",
    sport: "run",
    correlationGroupId: null,
    reasons: ["Observed test value."],
    provenance: { policyVersion: "test-policy-1", adapterVersion: "test-adapter-1", lineage: [] },
    ...overrides,
  };
}

function resolve(candidates: EvidenceCandidate[]) {
  return resolveEvidenceSet({
    evidenceSet: { version: EVIDENCE_VERSION, capabilityId: "threshold", candidates },
    policy,
  });
}

describe("resolveEvidenceSet", () => {
  it("applies candidate weight and freshness when aggregating continuous evidence", () => {
    const result = resolve([
      candidate({ sourceId: "fresh", value: 0.8 }),
      candidate({
        sourceId: "ten-days-old",
        value: 0.2,
        observedAt: "2026-06-30T00:00:00.000Z",
      }),
    ]);

    expect(result).toMatchObject({ status: "known", value: 0.6, confidence: 1 });
    expect(result.selectedCandidates).toHaveLength(2);
  });

  it("retains only the strongest candidate in a correlation group", () => {
    const result = resolve([
      candidate({
        sourceId: "weaker-duplicate",
        value: 0.2,
        weight: 0.4,
        confidence: 1,
        correlationGroupId: "same-effort",
      }),
      candidate({
        sourceId: "stronger-duplicate",
        value: 0.9,
        weight: 0.9,
        confidence: 1,
        correlationGroupId: "same-effort",
      }),
    ]);

    expect(result).toMatchObject({ value: 0.9, confidence: 0.9 });
    expect(result.explanation.selectedCandidateIds).toEqual([
      "test_adapter:stronger-duplicate@2026-07-10T00:00:00.000Z",
    ]);
    expect(result.explanation.excludedCorrelatedCandidateIds).toEqual([
      "test_adapter:weaker-duplicate@2026-07-10T00:00:00.000Z",
    ]);
  });

  it("preserves evidence with no numeric value as unknown", () => {
    const result = resolve([
      candidate({
        value: null,
        confidence: 0,
        sourceId: "unavailable",
        reasons: ["No source value."],
      }),
    ]);

    expect(result).toMatchObject({ status: "unknown", value: null, confidence: 0 });
    expect(result.explanation.unknownCandidateIds).toEqual([
      "test_adapter:unavailable@2026-07-10T00:00:00.000Z",
    ]);
  });

  it("is deterministic regardless of candidate input ordering", () => {
    const candidates = [
      candidate({ sourceId: "first", value: 0.4, weight: 0.7 }),
      candidate({ sourceId: "second", value: 0.8, weight: 0.5 }),
    ];

    expect(resolve(candidates)).toEqual(resolve([...candidates].reverse()));
  });
});
