import { randomUUID } from "node:crypto";
import {
  analyzeParsedActivityFile,
  reconcileGeneratedActivityEvidence,
} from "@repo/api/test-support/activity-evidence-acceptance";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySegments,
} from "@repo/db/schema";
import type { E2EDrizzleDatabase } from "./database";

/** Real synthetic effort analysis, restricted to the disposable acceptance runner. */
export async function seedBikeThresholdEvidence(input: {
  db: E2EDrizzleDatabase;
  profileId: string;
  completedAt: Date;
  name?: string;
  powerWatts?: number;
  heartRateBpm?: number;
}) {
  if (process.env.E2E_DISPOSABLE_DATABASE !== "1") {
    throw new Error("Athlete evidence fixtures require the disposable acceptance runner.");
  }
  const activityId = randomUUID();
  const artifactId = randomUUID();
  const startedAt = new Date(input.completedAt.getTime() - 1_800_000);
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  const power = input.powerWatts ?? 250;
  const heartRate = input.heartRateBpm ?? 170;
  const analysis = await analyzeParsedActivityFile(input.db, {
    activityId,
    profileId: input.profileId,
    artifactId,
    refreshWeather: false,
    parsedData: {
      metadata: { startTime: startedAt, type: "cycling" },
      summary: {
        totalTime: 1_800,
        totalDistance: 15_000,
        avgPower: power,
        avgHeartRate: heartRate,
      },
      records: Array.from({ length: 1_801 }, (_, second) => ({
        sessionMessageIndex: 0,
        timestamp: new Date(startedAt.getTime() + second * 1_000),
        power,
        heartRate,
      })),
      segments: [
        {
          sessionMessageIndex: 0,
          role: "activity",
          activity_category: "bike",
          rawSport: "cycling",
          startTime: startedAt,
          endTime: input.completedAt,
        },
      ],
    },
  });
  await input.db.transaction(async (transaction) => {
    await transaction.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: input.name ?? "Canonical bike threshold fixture",
      started_at: startedAt,
      finished_at: input.completedAt,
      elapsed_ms: analysis.summaryValues.elapsed_ms,
      active_ms: analysis.summaryValues.active_ms,
      moving_ms: analysis.summaryValues.moving_ms,
      timing_coverage: analysis.summaryValues.timing_coverage,
      segments_revision: 1,
      parser_version: "coach-zones-e2e-v1",
      decoded_contract_version: "coach-zones-e2e-v1",
      materializer_version: "coach-zones-e2e-v1",
      segments_generated_at: input.completedAt,
    });
    await transaction.insert(activityArtifacts).values({
      id: artifactId,
      profile_id: input.profileId,
      digest_algorithm: "sha256",
      digest,
      byte_size: 1024,
      bucket: "activity-files",
      path: `artifacts/sha256/${input.profileId}/${digest}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: input.completedAt,
    });
    await transaction.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: input.profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: input.completedAt,
    });
    await transaction.insert(activitySegments).values(
      analysis.segmentSet.segments.map((segment) => {
        const timing = segment.summary.timing;
        const source = segment.source;
        return {
          id: segment.id,
          activity_id: activityId,
          profile_id: input.profileId,
          ordinal: segment.ordinal,
          role: segment.role,
          activity_category: segment.role === "activity" ? segment.activity_category : null,
          start_offset_ms: segment.startOffsetMs,
          end_offset_ms: segment.endOffsetMs,
          source_artifact_id: source?.kind === "artifact" ? artifactId : null,
          source_session_index:
            source?.kind === "artifact" ? (source.sessionMessageIndex ?? null) : null,
          source_message_index: source?.kind === "artifact" ? (source.messageIndex ?? null) : null,
          raw_type_string: typeof source?.rawType === "string" ? source.rawType : null,
          raw_type_integer: typeof source?.rawType === "number" ? source.rawType : null,
          raw_sport_string: typeof source?.rawSport === "string" ? source.rawSport : null,
          raw_sport_integer: typeof source?.rawSport === "number" ? source.rawSport : null,
          raw_sub_sport_string: typeof source?.rawSubSport === "string" ? source.rawSubSport : null,
          raw_sub_sport_integer:
            typeof source?.rawSubSport === "number" ? source.rawSubSport : null,
          summary: segment.summary,
          summary_version: 1,
          timing_coverage: timing.timingCoverage,
          active_ms: "activeMs" in timing ? (timing.activeMs ?? null) : null,
          moving_ms: "movingMs" in timing ? (timing.movingMs ?? null) : null,
          segment_revision: 1,
          parser_version: "coach-zones-e2e-v1",
          materializer_version: "coach-zones-e2e-v1",
          created_at: input.completedAt,
        };
      }),
    );
  });
  await input.db.transaction((transaction) =>
    reconcileGeneratedActivityEvidence(transaction, {
      activityId,
      profileId: input.profileId,
      efforts: analysis.effortsToInsert,
      detectedLTHR: analysis.detectedLTHR,
      now: new Date(input.completedAt.getTime() + 1_000),
    }),
  );
  return { activityId };
}
