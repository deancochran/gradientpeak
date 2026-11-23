import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { buildPlaybackIndex } from "@repo/core/recording/playback";

export type AcceptedActivityStreamRecord =
  inferRouterOutputs<AppRouter>["activityFiles"]["getStreams"]["records"][number];

/** getStreams returns normalized degrees and m/s, not polyline tuples or FIT semicircles. */
export function indexAcceptedActivityRecords(records: readonly AcceptedActivityStreamRecord[]) {
  return buildPlaybackIndex(
    records.map((record) => ({
      timestamp: record.timestamp,
      metrics: {
        heartRate: record.heartRate,
        power: record.power,
        cadence: record.cadence,
        speed: record.speed,
        distance: record.distance,
        altitude: record.altitude,
        temperature: record.temperature,
      },
      ...(record.positionLat === undefined && record.positionLong === undefined
        ? {}
        : { position: { latitude: record.positionLat, longitude: record.positionLong } }),
    })),
  );
}
