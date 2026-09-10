import { createDirectProviderSourceProvenance, mapStravaActivityToCanonical } from "@repo/core";
import type { getRequiredDb } from "../../db";
import { createStravaRepository } from "../../infrastructure/repositories";
import type { StravaDetailedActivity, StravaStreams } from "../../lib/integrations/strava/client";
import { providerActivityId, submitActivity } from "./submit-activity";

function toCanonicalSource(activity: StravaDetailedActivity) {
  return {
    id: String(activity.id),
    name: activity.name,
    sportType: activity.sport_type ?? activity.type,
    startedAt: activity.start_date,
    elapsedSeconds: activity.elapsed_time,
    movingSeconds: activity.moving_time,
    distanceMeters: activity.distance,
    elevationGainMeters: activity.total_elevation_gain ?? null,
    caloriesKcal: activity.calories ?? null,
    averageHeartRateBpm: activity.average_heartrate ?? null,
    maxHeartRateBpm: activity.max_heartrate ?? null,
    averagePowerWatts: activity.average_watts ?? null,
    maxPowerWatts: activity.max_watts ?? null,
    averageCadenceRpm: activity.average_cadence ?? null,
    averageSpeedMetersPerSecond: activity.average_speed ?? null,
    maxSpeedMetersPerSecond: activity.max_speed ?? null,
    deviceName: activity.device_name ?? null,
    summaryPolyline: activity.map?.summary_polyline ?? null,
  };
}

function toCanonicalStreams(streams: StravaStreams) {
  return {
    ...(streams.time ? { time: streams.time.data } : {}),
    ...(streams.distance ? { distance: streams.distance.data } : {}),
    ...(streams.heartrate ? { heartrate: streams.heartrate.data } : {}),
    ...(streams.watts ? { watts: streams.watts.data } : {}),
    ...(streams.cadence ? { cadence: streams.cadence.data } : {}),
    ...(streams.velocity_smooth ? { velocity_smooth: streams.velocity_smooth.data } : {}),
    ...(streams.altitude ? { altitude: streams.altitude.data } : {}),
    ...(streams.latlng ? { latlng: streams.latlng.data } : {}),
    ...(streams.moving ? { moving: streams.moving.data } : {}),
    ...(streams.temp ? { temp: streams.temp.data } : {}),
  };
}

export async function importStravaActivity(
  input: {
    activity: StravaDetailedActivity;
    db: ReturnType<typeof getRequiredDb>;
    importRunId?: string;
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
    providerUpdatedAt: string | null;
    streams: StravaStreams;
    /** Explicit owner decision: materialize without restaging a probable duplicate. */
    reviewSourceReferenceId?: string;
  },
  dependencies: {
    convergeCompletedActivityUploadEcho?: ReturnType<
      typeof createStravaRepository
    >["convergeCompletedActivityUploadEcho"];
    findCompletedActivityUploadEcho?: ReturnType<
      typeof createStravaRepository
    >["findCompletedActivityUploadEcho"];
    submitCanonicalActivity?: typeof submitActivity;
  } = {},
) {
  const externalId = String(input.activity.id);
  const repository = createStravaRepository({ db: input.db });
  const findCompletedActivityUploadEcho =
    dependencies.findCompletedActivityUploadEcho ?? repository.findCompletedActivityUploadEcho;
  const convergeCompletedActivityUploadEcho =
    dependencies.convergeCompletedActivityUploadEcho ??
    repository.convergeCompletedActivityUploadEcho;
  const outboundIdentity = input.activity.external_id
    ? await findCompletedActivityUploadEcho({
        externalId: input.activity.external_id,
        integrationGeneration: input.integrationGeneration,
        integrationId: input.integrationId,
        profileId: input.profileId,
      })
    : null;
  const canonicalId =
    outboundIdentity?.activityId ?? providerActivityId(input.profileId, "strava", externalId);
  const mapped = mapStravaActivityToCanonical({
    activity: toCanonicalSource(input.activity),
    segmentId: canonicalId,
    streams: toCanonicalStreams(input.streams),
  });
  const directProvenance = createDirectProviderSourceProvenance({
    connectorId: "strava",
    externalId,
  });

  const submitted = await (dependencies.submitCanonicalActivity ?? submitActivity)(
    input.db,
    {
      requestedActivityId: canonicalId,
      profileId: input.profileId,
      name: mapped.name,
      notes: null,
      contentVisibility: "private",
      startedAt: mapped.startedAt,
      finishedAt: mapped.finishedAt,
      elapsedMs: mapped.elapsedMs,
      activeMs: mapped.activeMs,
      movingMs: mapped.movingMs,
      timingCoverage: mapped.timingCoverage,
      distanceMeters: mapped.distanceMeters,
      calories: mapped.calories,
      elevationGainMeters: mapped.elevationGainMeters,
      avgHeartRate: mapped.avgHeartRate,
      maxHeartRate: mapped.maxHeartRate,
      avgPower: mapped.avgPower,
      maxPower: mapped.maxPower,
      avgCadence: mapped.avgCadence,
      maxCadence: mapped.maxCadence,
      avgSpeedMps: mapped.avgSpeedMps,
      maxSpeedMps: mapped.maxSpeedMps,
      normalizedSpeedMps: null,
      avgTemperature: mapped.avgTemperature,
      deviceManufacturer: null,
      deviceProduct: mapped.deviceProduct,
      laps: null,
      mapBounds: mapped.mapBounds,
      polyline: mapped.polyline,
      providerProvenance: {
        ...directProvenance,
        integrationId: input.integrationId,
        integrationGeneration: input.integrationGeneration,
        providerUpdatedAt: input.providerUpdatedAt,
        ...(outboundIdentity
          ? {
              source: {
                sourceId: "gradientpeak",
                externalId: `strava:${outboundIdentity.activityId}`,
              },
            }
          : {}),
        relationshipKind: outboundIdentity ? ("exported" as const) : ("imported" as const),
        evidenceTier: mapped.evidenceTier,
      },
      segmentSet: mapped.segmentSet,
    },
    {
      ...(input.importRunId ? { importRunId: input.importRunId } : {}),
      deferAthleteStateRefresh: true,
      deferPerformanceCalibration: true,
      stageProbableProviderDuplicates: input.reviewSourceReferenceId === undefined,
      ...(input.reviewSourceReferenceId
        ? { confirmReviewedSourceId: input.reviewSourceReferenceId }
        : {}),
    },
  );
  if (outboundIdentity && input.activity.external_id) {
    const converged = await convergeCompletedActivityUploadEcho({
      activityId: outboundIdentity.activityId,
      externalId: input.activity.external_id,
      integrationGeneration: input.integrationGeneration,
      integrationId: input.integrationId,
      profileId: input.profileId,
      providerExternalId: externalId,
    });
    if (!converged) throw new Error("strava_upload_echo_convergence_failed");
  }
  return submitted;
}
