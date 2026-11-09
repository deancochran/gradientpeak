import { activities, activityEfforts, activitySegments } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import {
  installFinalizedRecordingArtifact,
  recordingSubmissionActivityId,
} from "../recording/indexed-db";
import { buildMeasuredSensorArtifact, SENSOR_FIXTURE } from "../recording/sensor-fixture";

test("[P0] accepted no-GPS measured sensor recording persists analytics and plays back without a route", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}) => {
  test.setTimeout(60_000);
  const profileId = athleteActor.profileId;
  if (!profileId) throw new Error("An owned athlete profile is required");
  let activityId: string | null = null;
  let submissionError: string | null = null;
  const unexpectedMapRequests: string[] = [];
  await athletePage.route("https://tile.openstreetmap.org/**", async (route) => {
    unexpectedMapRequests.push(route.request().url());
    await route.abort();
  });
  athletePage.on("response", async (response) => {
    if (!response.url().includes("activities.createFromRecordingSummary")) return;
    const body = await response.json().catch(() => null);
    const results = Array.isArray(body) ? body : [body];
    for (const result of results) {
      const message = result?.error?.json?.message ?? result?.error?.message;
      if (typeof message === "string") submissionError = message;
    }
  });
  try {
    // Initialize the actor-owned IndexedDB schema through the normal browser runtime
    // before installing the validated, finalized test fixture.
    await athletePage.goto("/record/session?activity_category=bike&gps=off");
    await installFinalizedRecordingArtifact(
      athletePage,
      await buildMeasuredSensorArtifact({
        ownerId: profileId,
        recordingSessionId: e2eIdentity.name("measured-no-gps-session"),
        segmentId: e2eIdentity.uuid("measured-no-gps-segment"),
      }),
    );
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: "Review recording" })).toBeVisible();
    await athletePage.getByRole("button", { name: "Save activity", exact: true }).click();
    const open = athletePage.getByRole("link", { name: "Open saved activity", exact: true });
    await expect
      .poll(async () => ((await open.isVisible()) ? "saved" : (submissionError ?? "pending")), {
        timeout: 20_000,
      })
      .toBe("saved");
    activityId = await recordingSubmissionActivityId(athletePage);
    if (!activityId)
      throw new Error("Saved sensor recording must expose its durable activity identity.");
    e2eData.activities.register(activityId, profileId);

    const [persisted] = await e2eDatabase.db
      .select({
        distanceMeters: activities.distance_meters,
        averageHeartRate: activities.avg_heart_rate,
        maxHeartRate: activities.max_heart_rate,
        averagePower: activities.avg_power,
        maxPower: activities.max_power,
        averageCadence: activities.avg_cadence,
        maxCadence: activities.max_cadence,
        averageSpeedMps: activities.avg_speed_mps,
        maxSpeedMps: activities.max_speed_mps,
      })
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)));
    expect(persisted).toEqual({
      distanceMeters: 0,
      averageHeartRate: SENSOR_FIXTURE.heartRate,
      maxHeartRate: SENSOR_FIXTURE.heartRate,
      averagePower: SENSOR_FIXTURE.power,
      maxPower: SENSOR_FIXTURE.power,
      averageCadence: SENSOR_FIXTURE.cadence,
      maxCadence: SENSOR_FIXTURE.cadence,
      averageSpeedMps: SENSOR_FIXTURE.speedMps,
      maxSpeedMps: SENSOR_FIXTURE.speedMps,
    });
    const segments = await e2eDatabase.db
      .select({
        id: activitySegments.id,
        startOffsetMs: activitySegments.start_offset_ms,
        endOffsetMs: activitySegments.end_offset_ms,
        timingCoverage: activitySegments.timing_coverage,
        activeMs: activitySegments.active_ms,
        movingMs: activitySegments.moving_ms,
        summary: activitySegments.summary,
        sourceArtifactId: activitySegments.source_artifact_id,
        segmentRevision: activitySegments.segment_revision,
      })
      .from(activitySegments)
      .where(
        and(
          eq(activitySegments.activity_id, activityId),
          eq(activitySegments.profile_id, profileId),
        ),
      );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startOffsetMs: 0,
      endOffsetMs: SENSOR_FIXTURE.elapsedMs,
      timingCoverage: "partial",
      activeMs: SENSOR_FIXTURE.elapsedMs,
      // This indoor fixture measures sensors, not movement classification.
      movingMs: null,
      sourceArtifactId: expect.any(String),
      summary: expect.objectContaining({
        averageHeartRateBpm: SENSOR_FIXTURE.heartRate,
        averagePowerWatts: SENSOR_FIXTURE.power,
        averageCadenceRpm: SENSOR_FIXTURE.cadence,
        averageSpeedMetersPerSecond: SENSOR_FIXTURE.speedMps,
        normalizedPowerResult: expect.objectContaining({ valueWatts: SENSOR_FIXTURE.power }),
      }),
    });
    const generatedPowerEfforts = await e2eDatabase.db
      .select({
        segmentId: activityEfforts.segment_id,
        effortType: activityEfforts.effort_type,
        sourceArtifactId: activityEfforts.source_artifact_id,
        sourceRevision: activityEfforts.source_revision,
        startOffsetMs: activityEfforts.start_offset_ms,
        endOffsetMs: activityEfforts.end_offset_ms,
      })
      .from(activityEfforts)
      .where(
        and(
          eq(activityEfforts.activity_id, activityId),
          eq(activityEfforts.profile_id, profileId),
          eq(activityEfforts.effort_type, "power"),
        ),
      );
    expect(generatedPowerEfforts.length).toBeGreaterThanOrEqual(1);
    for (const effort of generatedPowerEfforts) {
      expect(effort).toMatchObject({
        segmentId: segments[0]?.id,
        effortType: "power",
        sourceArtifactId: segments[0]?.sourceArtifactId,
        sourceRevision: segments[0]?.segmentRevision,
      });
      expect(effort.startOffsetMs).toBeGreaterThanOrEqual(segments[0]?.startOffsetMs ?? 0);
      expect(effort.endOffsetMs).toBeLessThanOrEqual(segments[0]?.endOffsetMs ?? 0);
    }

    await open.click();
    await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}$`));
    const playback = athletePage.getByTestId("activity-playback");
    await expect(playback.getByTestId("playback-metric-heartRate")).toContainText("150 bpm");
    await expect(playback.getByTestId("playback-metric-power")).toContainText("200 W");
    await expect(playback.getByTestId("playback-metric-cadence")).toContainText("90 /min");
    await expect(playback.getByTestId("playback-metric-speed")).toContainText("10 m/s");
    await expect(playback.getByTestId("playback-position-marker")).toHaveCount(0);
    const seek = playback.getByRole("slider", { name: "Playback elapsed time" });
    await playback.getByRole("button", { name: "Play playback" }).click();
    await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0);
    await playback.getByRole("button", { name: "Pause playback" }).click();
    await seek.fill("120000");
    await expect(playback.getByTestId("playback-metric-power")).toContainText("200 W");
    await athletePage.reload();
    await expect(playback.getByTestId("playback-metric-heartRate")).toContainText("150 bpm");
    await expect(playback.getByTestId("playback-position-marker")).toHaveCount(0);
    expect(unexpectedMapRequests).toEqual([]);
  } finally {
    await athletePage.unroute("https://tile.openstreetmap.org/**");
    activityId ??= await recordingSubmissionActivityId(athletePage);
    if (activityId) {
      e2eData.activities.register(activityId, profileId);
      await deleteImportedActivity(athletePage, activityId);
    }
  }
});
