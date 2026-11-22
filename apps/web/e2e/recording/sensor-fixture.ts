import {
  appendMeasuredNotification,
  closeMeasuredWindow,
  emptyMeasuredJournal,
  openMeasuredWindow,
} from "@repo/core/recording/measured-journal";
import { finalizeTimerRecordingArtifact } from "../../src/lib/recording/finalized-artifact";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  startTimerOnlyRecording,
} from "../../src/lib/recording/timer-runtime";

export const SENSOR_FIXTURE = {
  startedAt: "2026-09-01T12:00:00.000Z",
  elapsedMs: 240_000,
  heartRate: 150,
  power: 200,
  cadence: 90,
  speedMps: 10,
} as const;

/**
 * Test-synthetic fixture data, built through the production journal and
 * finalized-artifact boundary. It emulates a BLE adapter's accepted measured
 * notifications; it is not evidence of physical Bluetooth hardware.
 */
export async function buildMeasuredSensorArtifact({
  ownerId,
  recordingSessionId,
  segmentId,
}: {
  ownerId: string;
  recordingSessionId: string;
  segmentId: string;
}) {
  const startedAtMs = Date.parse(SENSOR_FIXTURE.startedAt);
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "bike",
  });
  if (configured.rejectedReason) throw new Error(configured.rejectedReason);
  const started = startTimerOnlyRecording(configured.state, startedAtMs, recordingSessionId);
  if (started.rejectedReason) throw new Error(started.rejectedReason);
  const finished = finishTimerOnlyRecording(started.state, startedAtMs + SENSOR_FIXTURE.elapsedMs);
  if (finished.rejectedReason) throw new Error(finished.rejectedReason);

  let journal = openMeasuredWindow(emptyMeasuredJournal(), SENSOR_FIXTURE.startedAt);
  for (
    let offsetMs = 0, sequenceNumber = 1;
    offsetMs <= SENSOR_FIXTURE.elapsedMs;
    offsetMs += 4_000
  ) {
    const recordedAt = new Date(startedAtMs + offsetMs).toISOString();
    journal = appendMeasuredNotification(journal, {
      origin: "bluetooth_notification",
      sourceId: "e2e-trainer",
      recordedAt,
      sequenceNumber,
      samples: [
        measured("heart_rate", "bpm", SENSOR_FIXTURE.heartRate, recordedAt, sequenceNumber),
        measured("power", "watts", SENSOR_FIXTURE.power, recordedAt, sequenceNumber),
        measured("cadence", "rpm", SENSOR_FIXTURE.cadence, recordedAt, sequenceNumber),
        measured("speed", "meters_per_second", SENSOR_FIXTURE.speedMps, recordedAt, sequenceNumber),
        measured("distance", "meters", offsetMs / 100, recordedAt, sequenceNumber),
      ],
    });
    sequenceNumber += 1;
  }
  journal = closeMeasuredWindow(
    journal,
    new Date(startedAtMs + SENSOR_FIXTURE.elapsedMs).toISOString(),
  );
  return finalizeTimerRecordingArtifact({
    state: finished.state,
    measuredJournal: journal,
    ownerId,
    segmentId,
    review: {
      name: "E2E measured no-GPS ride",
      notes: null,
      perceivedEffort: null,
      distanceMeters: 0,
      calories: null,
      distanceEnteredManually: false,
      caloriesEnteredManually: false,
    },
  });
}

function measured(
  metricFamily: "heart_rate" | "power" | "cadence" | "speed" | "distance",
  unit: "bpm" | "watts" | "rpm" | "meters_per_second" | "meters",
  value: number,
  recordedAt: string,
  sequenceNumber: number,
) {
  return {
    metricFamily,
    unit,
    value,
    recordedAt,
    sequenceNumber,
    source: {
      sourceId: "e2e-trainer",
      sourceType: "trainer_passthrough" as const,
      provenance: "actual" as const,
      adapterId: "web-bluetooth" as const,
    },
  };
}
