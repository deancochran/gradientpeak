import {
  type ActivityTssIdentity,
  loadSeriesIdentityForActivityTss,
  sameLoadSeriesIdentity,
} from "@repo/core";

export type CompletedObservationState = "known_zero" | "observed" | "unavailable" | "uncovered";

export type CompletedObservationMetadata = {
  hasUnavailableCompletedActivity: boolean;
  identity: ActivityTssIdentity | null;
  state: CompletedObservationState;
};

export function sameTssIdentity(
  left: ActivityTssIdentity | null | undefined,
  right: ActivityTssIdentity | null | undefined,
) {
  if (!left || !right) return left === right;
  return sameLoadSeriesIdentity(
    loadSeriesIdentityForActivityTss(left),
    loadSeriesIdentityForActivityTss(right),
  );
}
