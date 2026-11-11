import type { CanonicalActivityCategory } from "@repo/core";

export const PROVIDER_PROBABLE_START_TOLERANCE_MS = 120_000;

export type ProviderActivityMatchCandidate = {
  activityCategory: CanonicalActivityCategory;
  activityId: string;
  elapsedMs: number;
  startedAt: Date;
};

export function isProbableProviderActivityMatch(input: {
  candidate: ProviderActivityMatchCandidate;
  incoming: Omit<ProviderActivityMatchCandidate, "activityId">;
}): boolean {
  if (input.candidate.activityCategory !== input.incoming.activityCategory) return false;
  if (
    Math.abs(input.candidate.startedAt.getTime() - input.incoming.startedAt.getTime()) >
    PROVIDER_PROBABLE_START_TOLERANCE_MS
  ) {
    return false;
  }
  const durationToleranceMs = Math.max(60_000, input.incoming.elapsedMs * 0.05);
  return Math.abs(input.candidate.elapsedMs - input.incoming.elapsedMs) <= durationToleranceMs;
}

export type ProviderActivityMatchDecision =
  | { kind: "exact"; activityId: string }
  | { kind: "create" }
  | { kind: "review"; candidateActivityId: string | null; candidateCount: number };

export function decideProviderActivityMatch(input: {
  exactActivityId: string | null;
  incoming: Omit<ProviderActivityMatchCandidate, "activityId">;
  candidates: readonly ProviderActivityMatchCandidate[];
}): ProviderActivityMatchDecision {
  if (input.exactActivityId) return { kind: "exact", activityId: input.exactActivityId };
  const probable = input.candidates.filter((candidate) =>
    isProbableProviderActivityMatch({ candidate, incoming: input.incoming }),
  );
  if (probable.length === 0) return { kind: "create" };
  return {
    kind: "review",
    candidateActivityId: probable.length === 1 ? (probable[0]?.activityId ?? null) : null,
    candidateCount: probable.length,
  };
}
