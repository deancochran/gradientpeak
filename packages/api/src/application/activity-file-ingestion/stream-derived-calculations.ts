import { randomUUID } from "node:crypto";
import { isSupportedActivityEffortCombination } from "@repo/core/athlete-inputs";
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

type DerivedStreamMetadata = Pick<
  ActivityFileStreamMetadata,
  "powerStream" | "hrStream" | "timestamps" | "altitudeStream" | "speedStream"
> &
  Partial<
    Pick<
      ActivityFileStreamMetadata,
      "powerTimestamps" | "hrTimestamps" | "altitudeTimestamps" | "speedTimestamps"
    >
  >;

export interface ActivityFileStreamDerivedMetricsInput {
  activityType: string;
  distance: number;
  duration: number;
  avgHeartRate?: number | null;
  streamMetadata: DerivedStreamMetadata;
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

function resolveMetricTimestamps(
  stream: number[],
  explicitTimestamps: number[] | undefined,
  fallbackTimestamps: number[],
): number[] {
  if (explicitTimestamps !== undefined) {
    return explicitTimestamps.length === stream.length ? explicitTimestamps : [];
  }
  return fallbackTimestamps;
}

function alignStreams(
  primaryValues: number[],
  primaryTimestamps: number[],
  secondaryValues: number[],
  secondaryTimestamps: number[],
): { primaryValues: number[]; secondaryValues: number[]; timestamps: number[] } {
  if (
    primaryValues.length !== primaryTimestamps.length ||
    secondaryValues.length !== secondaryTimestamps.length
  ) {
    return { primaryValues: [], secondaryValues: [], timestamps: [] };
  }

  const secondaryByTimestamp = new Map<number, number>();
  for (let index = 0; index < secondaryTimestamps.length; index++) {
    const timestamp = secondaryTimestamps[index];
    const value = secondaryValues[index];
    if (timestamp !== undefined && value !== undefined) secondaryByTimestamp.set(timestamp, value);
  }
  const alignedPrimary: number[] = [];
  const alignedSecondary: number[] = [];
  const timestamps: number[] = [];

  for (let index = 0; index < primaryValues.length; index++) {
    const timestamp = primaryTimestamps[index];
    const primaryValue = primaryValues[index];
    if (timestamp === undefined || primaryValue === undefined) continue;
    const secondaryValue = secondaryByTimestamp.get(timestamp);
    if (secondaryValue === undefined) continue;
    alignedPrimary.push(primaryValue);
    alignedSecondary.push(secondaryValue);
    timestamps.push(timestamp);
  }

  return { primaryValues: alignedPrimary, secondaryValues: alignedSecondary, timestamps };
}

function buildGradedSpeedStream(
  streamMetadata: Pick<
    DerivedStreamMetadata,
    "timestamps" | "altitudeStream" | "speedStream" | "altitudeTimestamps" | "speedTimestamps"
  >,
): { values: number[]; timestamps: number[] } {
  const speedTimestamps = resolveMetricTimestamps(
    streamMetadata.speedStream,
    streamMetadata.speedTimestamps,
    streamMetadata.timestamps,
  );
  const altitudeTimestamps = resolveMetricTimestamps(
    streamMetadata.altitudeStream,
    streamMetadata.altitudeTimestamps,
    streamMetadata.timestamps,
  );
  const aligned = alignStreams(
    streamMetadata.speedStream,
    speedTimestamps,
    streamMetadata.altitudeStream,
    altitudeTimestamps,
  );

  return {
    values: calculateGradedSpeedStream(
      aligned.primaryValues,
      aligned.secondaryValues,
      aligned.timestamps,
    ),
    timestamps: aligned.timestamps,
  };
}

export function calculateActivityFileStreamDerivedMetrics(
  input: ActivityFileStreamDerivedMetricsInput,
): ActivityFileStreamDerivedMetrics {
  const { powerStream, hrStream, timestamps, altitudeStream, speedStream } = input.streamMetadata;
  const powerTimestamps = resolveMetricTimestamps(
    powerStream,
    input.streamMetadata.powerTimestamps,
    timestamps,
  );
  const hrTimestamps = resolveMetricTimestamps(
    hrStream,
    input.streamMetadata.hrTimestamps,
    timestamps,
  );
  const speedTimestamps = resolveMetricTimestamps(
    speedStream,
    input.streamMetadata.speedTimestamps,
    timestamps,
  );
  const normalizedPower =
    powerStream.length > 0 ? calculateNormalizedPower(powerStream) : undefined;
  const normalizedSpeed = calculateNormalizedSpeed(input.distance, input.duration);

  let normalizedGradedSpeed: number | null = null;
  let gradedSpeedStream: { values: number[]; timestamps: number[] } | null = null;
  if (input.activityType === "run" && speedStream.length > 0 && altitudeStream.length > 0) {
    gradedSpeedStream = buildGradedSpeedStream(input.streamMetadata);
    if (gradedSpeedStream.values.length > 0) {
      normalizedGradedSpeed = calculateNGP(gradedSpeedStream.values);
    }
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
    const aligned = alignStreams(powerStream, powerTimestamps, hrStream, hrTimestamps);
    aerobicDecoupling = calculateDecouplingFromStreams(
      aligned.primaryValues,
      aligned.secondaryValues,
      aligned.timestamps,
      calculateNormalizedPower,
    );
  } else if (input.activityType === "run" && speedStream.length > 0 && hrStream.length > 0) {
    const runPowerStream = gradedSpeedStream ?? {
      values: speedStream,
      timestamps: speedTimestamps,
    };
    const aligned = alignStreams(
      runPowerStream.values,
      runPowerStream.timestamps,
      hrStream,
      hrTimestamps,
    );
    aerobicDecoupling = calculateDecouplingFromStreams(
      aligned.primaryValues,
      aligned.secondaryValues,
      aligned.timestamps,
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
    DerivedStreamMetadata,
    | "powerStream"
    | "timestamps"
    | "altitudeStream"
    | "speedStream"
    | "powerTimestamps"
    | "altitudeTimestamps"
    | "speedTimestamps"
  >;
}): Array<typeof activityEfforts.$inferInsert> {
  const { powerStream, timestamps, speedStream } = input.streamMetadata;
  const powerTimestamps = resolveMetricTimestamps(
    powerStream,
    input.streamMetadata.powerTimestamps,
    timestamps,
  );
  const speedTimestamps = resolveMetricTimestamps(
    speedStream,
    input.streamMetadata.speedTimestamps,
    timestamps,
  );
  const effortsToInsert: Array<typeof activityEfforts.$inferInsert> = [];

  if (
    powerStream.length > 0 &&
    isSupportedActivityEffortCombination({
      activityCategory: input.activityType,
      effortType: "power",
    })
  ) {
    for (const effort of calculateBestEfforts(powerStream, powerTimestamps)) {
      effortsToInsert.push(
        buildActivityFileBestEffortRow(input, effort, powerTimestamps, "power", "watts"),
      );
    }
  }

  if (speedStream.length > 0 && (input.activityType === "run" || input.activityType === "swim")) {
    const streamToUse =
      input.activityType === "run" && input.normalizedGradedSpeed
        ? buildGradedSpeedStream(input.streamMetadata)
        : { values: speedStream, timestamps: speedTimestamps };
    for (const effort of calculateBestEfforts(streamToUse.values, streamToUse.timestamps)) {
      effortsToInsert.push(
        buildActivityFileBestEffortRow(
          input,
          effort,
          streamToUse.timestamps,
          "speed",
          "meters_per_second",
        ),
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
  effortTimestamps: number[],
  effortType: "power" | "speed",
  unit: "watts" | "meters_per_second",
): typeof activityEfforts.$inferInsert {
  const { timestamps } = input.streamMetadata;
  const effortStartedAt = effortTimestamps[effort.startIndex];
  const streamStartedAt = timestamps[0];

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
      effortStartedAt === undefined || streamStartedAt === undefined
        ? null
        : Math.round(effortStartedAt - streamStartedAt),
    unit,
    value: effort.value,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "activity-file-best-effort-v1",
    provenance: {
      activity_id: input.activityId,
      derived_from: "activity_file_stream",
    },
  };
}
