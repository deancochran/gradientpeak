import { persistedThresholdEvidenceCollectionSchema } from "@repo/core/athlete-derived-state";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";

export async function readActiveThresholdEvidence(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  fromObservedAt: string;
  limit: number;
  after?: { observedAt: string; evidenceId: string };
}) {
  const page = await input.repository.listActiveThresholdEvidence(input);
  const items = persistedThresholdEvidenceCollectionSchema.parse(page.items);
  if (
    items.some(
      (record) => record.profileId !== input.profileId || record.lifecycle.status !== "active",
    )
  ) {
    throw new Error("Threshold evidence read crossed its active profile boundary");
  }
  return { items, hasMore: page.hasMore };
}
