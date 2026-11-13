import {
  type PersistedThresholdEvidence,
  persistedThresholdEvidenceCollectionSchema,
} from "@repo/core/athlete-derived-state";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";

export async function replaceThresholdEvidence(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  activityId: string;
  evidence: PersistedThresholdEvidence[];
}) {
  const evidence = persistedThresholdEvidenceCollectionSchema.parse(input.evidence);
  if (
    evidence.some(
      (record) =>
        record.profileId !== input.profileId ||
        record.evidence.activityId !== input.activityId ||
        record.lifecycle.status !== "active",
    )
  ) {
    throw new Error("Active threshold evidence owner or activity mismatch");
  }
  await input.repository.replaceThresholdEvidenceForActivity({
    profileId: input.profileId,
    activityId: input.activityId,
    evidence,
  });
  return evidence;
}

export async function invalidateThresholdEvidence(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  activityId: string;
  status: "superseded";
  invalidatedAt: string;
}) {
  return input.repository.invalidateThresholdEvidenceForActivity(input);
}

/** Activity deletion is a hard-retention boundary: no evidence tombstone is retained. */
export async function deleteThresholdEvidence(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  activityId: string;
}) {
  return input.repository.deleteThresholdEvidenceForActivity({
    profileId: input.profileId,
    activityId: input.activityId,
  });
}
