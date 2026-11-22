import { ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION } from "@repo/core/athlete-derived-state";
import { describe, expect, it, vi } from "vitest";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { readActiveThresholdEvidence } from "./read-active-threshold-evidence";
import { replaceThresholdEvidence } from "./replace-threshold-evidence";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const record = {
  contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  profileId,
  calculationVersion: "threshold-v1",
  confidence: 1,
  evidence: {
    evidenceId: "33333333-3333-4333-8333-333333333333",
    activityId,
    activityCategory: "bike" as const,
    metric: "power" as const,
    unit: "watts" as const,
    method: "bike_power_30m" as const,
    value: 280,
    sourceSeriesId: "power-primary",
    sourceSeriesMetric: "power" as const,
    startTimestampSeconds: 0,
    endTimestampSeconds: 1800,
    exactWindowSeconds: 1800,
    conversionFactor: 1,
    policyVersion: "threshold-policy-v1" as const,
    plausibilityVersion: "threshold-plausibility-v1" as const,
    observedAt: "2026-08-01T00:00:00.000Z",
  },
  lifecycle: { status: "active" as const, invalidatedAt: null },
};

describe("threshold evidence services", () => {
  it("replaces one owned activity atomically and reads active evidence only", async () => {
    const replace = vi.fn(async () => undefined);
    const repository = {
      replaceThresholdEvidenceForActivity: replace,
      listActiveThresholdEvidence: async () => ({ items: [record], hasMore: false }),
    } as unknown as AthleteDerivedStateRepositoryPort;
    await expect(
      replaceThresholdEvidence({ repository, profileId, activityId, evidence: [record] }),
    ).resolves.toEqual([record]);
    await expect(
      readActiveThresholdEvidence({
        repository,
        profileId,
        fromObservedAt: "2026-01-01T00:00:00.000Z",
        limit: 10,
      }),
    ).resolves.toMatchObject({ items: [{ lifecycle: { status: "active" } }] });
    expect(replace).toHaveBeenCalledOnce();
  });

  it("rejects cross-profile evidence before persistence", async () => {
    const repository = {
      replaceThresholdEvidenceForActivity: vi.fn(),
    } as unknown as AthleteDerivedStateRepositoryPort;
    await expect(
      replaceThresholdEvidence({
        repository,
        profileId: "44444444-4444-4444-8444-444444444444",
        activityId,
        evidence: [record],
      }),
    ).rejects.toThrow("owner or activity mismatch");
    expect(repository.replaceThresholdEvidenceForActivity).not.toHaveBeenCalled();
  });
});
