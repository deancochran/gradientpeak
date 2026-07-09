import { randomUUID } from "node:crypto";
import {
  calculateBestEfforts,
  calculateDecouplingFromStreams,
  calculateEfficiencyFactor,
  calculateGradedSpeedStream,
  calculateNGP,
  calculateNormalizedPower,
  calculateNormalizedSpeed,
} from "@repo/core/calculations";
import type { activityEfforts } from "@repo/db";
import type { ActivityFileStreamMetadata } from "./stream-metadata";

export interface ActivityFileStreamDerivedMetricsInput {
  activityType: string;
  distance: number;
  duration: number;
  avgHeartRate?: number | null;
  streamMetadata: Pick<
    ActivityFileStreamMetadata,
    "powerStream" | "hrStream" | "timestamps" | "altitudeStream" | "speedStream"
  >;
}

export interface ActivityFileStreamDerivedCalculationsInput
  extends ActivityFileStreamDerivedMetricsInput {
  activityId: string;
  profileId: string;
  recordedAt: Date;
}

export interface ActivityFileStreamDerivedMetrics {
  normalizedPower: number | undefined;
  normalizedSpeed: number;
  normalizedGradedSpeed: number | null;
  efficiencyFactor: number | null;
  aerobicDecoupling: number | null;
}

export interface ActivityFileStreamDerivedCalculations extends ActivityFileStreamDerivedMetrics {
  effortsToInsert: Array<typeof activityEfforts.$inferInsert>;
}

export function calculateActivityFileStreamDerivedMetrics(
  input: ActivityFileStreamDerivedMetricsInput,
): ActivityFileStreamDerivedMetrics {
  const { powerStream, hrStream, timestamps, altitudeStream, speedStream } = input.streamMetadata;
  const normalizedPower =
    powerStream.length > 0 ? calculateNormalizedPower(powerStream) : undefined;
  const normalizedSpeed = calculateNormalizedSpeed(input.distance, input.duration);

  let normalizedGradedSpeed: number | null = null;
  if (input.activityType === "run" && speedStream.length > 0 && altitudeStream.length > 0) {
    normalizedGradedSpeed = calculateNGP(
      calculateGradedSpeedStream(speedStream, altitudeStream, timestamps),
    );
  }

  let efficiencyFactor: number | null = null;
  if (input.avgHeartRate && input.avgHeartRate > 0) {
    if (input.activityType === "bike" && normalizedPower) {
      efficiencyFactor = calculateEfficiencyFactor(normalizedPower, input.avgHeartRate);
    } else if (input.activityType === "run" && normalizedGradedSpeed) {
      efficiencyFactor = calculateEfficiencyFactor(normalizedGradedSpeed, input.avgHeartRate);
    }
  }

  let aerobicDecoupling: number | null = null;
  if (powerStream.length > 0 && hrStream.length > 0) {
    aerobicDecoupling = calculateDecouplingFromStreams(
      powerStream,
      hrStream,
      timestamps,
      calculateNormalizedPower,
    );
  } else if (input.activityType === "run" && speedStream.length > 0 && hrStream.length > 0) {
    const runPowerStream = normalizedGradedSpeed
      ? calculateGradedSpeedStream(speedStream, altitudeStream, timestamps)
      : speedStream;
    aerobicDecoupling = calculateDecouplingFromStreams(
      runPowerStream,
      hrStream,
      timestamps,
      calculateNGP,
    );
  }

  return {
    normalizedPower,
    normalizedSpeed,
    normalizedGradedSpeed,
    efficiencyFactor,
    aerobicDecoupling,
  };
}

export function calculateActivityFileStreamDerivedCalculations(
  input: ActivityFileStreamDerivedCalculationsInput,
): ActivityFileStreamDerivedCalculations {
  const metrics = calculateActivityFileStreamDerivedMetrics(input);

  return {
    ...metrics,
    effortsToInsert: buildActivityFileBestEffortRows({
      activityId: input.activityId,
      profileId: input.profileId,
      activityType: input.activityType,
      recordedAt: input.recordedAt,
      normalizedGradedSpeed: metrics.normalizedGradedSpeed,
      streamMetadata: input.streamMetadata,
    }),
  };
}

export function buildActivityFileBestEffortRows(input: {
  activityId: string;
  profileId: string;
  activityType: string;
  recordedAt: Date;
  normalizedGradedSpeed: number | null;
  streamMetadata: Pick<
    ActivityFileStreamMetadata,
    "powerStream" | "timestamps" | "altitudeStream" | "speedStream"
  >;
}): Array<typeof activityEfforts.$inferInsert> {
  const { powerStream, timestamps, altitudeStream, speedStream } = input.streamMetadata;
  const effortsToInsert: Array<typeof activityEfforts.$inferInsert> = [];

  if (powerStream.length > 0) {
    for (const effort of calculateBestEfforts(powerStream, timestamps)) {
      effortsToInsert.push(buildActivityFileBestEffortRow(input, effort, "power", "watts"));
    }
  }

  if (input.activityType === "run" && speedStream.length > 0) {
    const streamToUse = input.normalizedGradedSpeed
      ? calculateGradedSpeedStream(speedStream, altitudeStream, timestamps)
      : speedStream;
    for (const effort of calculateBestEfforts(streamToUse, timestamps)) {
      effortsToInsert.push(
        buildActivityFileBestEffortRow(input, effort, "speed", "meters_per_second"),
      );
    }
  }

  return effortsToInsert;
}

function buildActivityFileBestEffortRow(
  input: {
    activityId: string;
    profileId: string;
    activityType: string;
    recordedAt: Date;
    streamMetadata: Pick<ActivityFileStreamMetadata, "timestamps">;
  },
  effort: ReturnType<typeof calculateBestEfforts>[number],
  effortType: "power" | "speed",
  unit: "watts" | "meters_per_second",
): typeof activityEfforts.$inferInsert {
  const { timestamps } = input.streamMetadata;

  return {
    id: randomUUID(),
    created_at: new Date(),
    updated_at: new Date(),
    activity_id: input.activityId,
    profile_id: input.profileId,
    recorded_at: input.recordedAt,
    activity_category: input.activityType as typeof activityEfforts.$inferInsert.activity_category,
    effort_type: effortType,
    duration_seconds: effort.duration,
    start_offset:
      effort.startIndex !== undefined
        ? Math.round(timestamps[effort.startIndex]! - timestamps[0]!)
        : null,
    unit,
    value: effort.value,
  };
}
