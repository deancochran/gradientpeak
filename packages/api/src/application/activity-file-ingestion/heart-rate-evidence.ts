import { calculateHeartRateDuration, type HeartRateDurationEvidence } from "@repo/core/zones";

import type { ActivityFileTimelineSample } from "./stream-metadata";

/** Maps decoded file records to the same interval contract used by live recording. */
export function calculateActivityFileHeartRateEvidence(input: {
  samples: readonly ActivityFileTimelineSample[];
  includedTimeline?: readonly boolean[];
  maxGapSeconds?: number;
}): HeartRateDurationEvidence {
  if (
    input.includedTimeline !== undefined &&
    input.includedTimeline.length !== input.samples.length
  ) {
    throw new Error("Heart-rate inclusion flags must align with the canonical activity timeline");
  }
  return calculateHeartRateDuration({
    samples: input.samples.map((sample, index) => ({
      timestampSeconds: sample.timestampSeconds,
      heartRateBpm: sample.heartRateBpm,
      ...(input.includedTimeline?.[index] === undefined
        ? {}
        : { included: input.includedTimeline[index] }),
    })),
    ...(input.maxGapSeconds === undefined ? {} : { maxGapSeconds: input.maxGapSeconds }),
  });
}
