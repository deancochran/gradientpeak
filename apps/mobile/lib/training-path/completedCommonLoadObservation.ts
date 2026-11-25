export type CommonLoadIdentity = { model: string; version: string };

export type CompletedObservationState = "known_zero" | "observed" | "unavailable" | "uncovered";

export type CompletedObservationMetadata = {
  hasUnavailableCompletedActivity: boolean;
  identity: CommonLoadIdentity | null;
  state: CompletedObservationState;
};

export function sameCommonLoadIdentity(
  left: CommonLoadIdentity | null | undefined,
  right: CommonLoadIdentity | null | undefined,
) {
  if (!left || !right) return left === right;
  return left.model === right.model && left.version === right.version;
}
