import {
  commonLoadResultSchema,
  type LoadSeriesIdentity,
  loadSeriesIdentityForAvailableCommonLoad,
  loadSeriesIdentitySchema,
  sameLoadSeriesIdentity,
} from "@repo/core";
import type { CanonicalCompletedObservationLoadProjection } from "../../../../lib/activity-analysis";

export type AdaptedActivityTrainingLoad = {
  value: number;
  identity: LoadSeriesIdentity;
};

export type AdaptActivityTrainingLoadsResult =
  | { status: "available"; byActivityId: Map<string, AdaptedActivityTrainingLoad> }
  | { status: "duplicate_activity"; activityId: string };

/**
 * Adapts the canonical completed-observation projection without recalculating
 * Common Load. Duplicate delivery is an explicit integrity result, never a Map overwrite.
 */
export function adaptActivityTrainingLoads(input: {
  projections: readonly CanonicalCompletedObservationLoadProjection[];
}): AdaptActivityTrainingLoadsResult {
  const byActivityId = new Map<string, AdaptedActivityTrainingLoad>();
  const seenActivityIds = new Set<string>();

  for (const projection of input.projections) {
    if (seenActivityIds.has(projection.activityId)) {
      return { status: "duplicate_activity", activityId: projection.activityId };
    }
    seenActivityIds.add(projection.activityId);

    const commonLoad = commonLoadResultSchema.parse(projection.commonLoad);
    if (commonLoad.status !== "available") {
      if (projection.loadSeriesIdentity !== null) {
        throw new Error("Unavailable completed Common Load cannot claim a load-series identity");
      }
      continue;
    }
    if (projection.loadSeriesIdentity === null) {
      throw new Error(
        "Available completed Common Load requires its canonical load-series identity",
      );
    }
    const identity = loadSeriesIdentitySchema.parse(projection.loadSeriesIdentity);
    const expectedIdentity = loadSeriesIdentityForAvailableCommonLoad(commonLoad);
    if (!sameLoadSeriesIdentity(identity, expectedIdentity)) {
      throw new Error("Completed Common Load projection identity does not match its load result");
    }
    byActivityId.set(projection.activityId, { value: commonLoad.load, identity });
  }

  return { status: "available", byActivityId };
}
