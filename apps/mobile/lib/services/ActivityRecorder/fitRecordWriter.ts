import type { FitRecord } from "../fit/GarminFitEncoder";
import type { RecordingPlanOccurrence } from "./plan";

interface FitRecordSink {
  addRecord(record: FitRecord): Promise<void>;
}

export interface RecordingRewindEvidenceBoundary {
  supersededFrom: string;
  rewoundAt: string;
  sourceDistanceMeters?: number;
  destinationDistanceMeters?: number;
}

export function rebaseRetainedFitRecordDistances<
  T extends { timestamp: number; distance?: number },
>(records: readonly T[], rewindJournal: readonly RecordingRewindEvidenceBoundary[]): T[] {
  const orderedRewinds = [...rewindJournal].sort(
    (left, right) => Date.parse(left.rewoundAt) - Date.parse(right.rewoundAt),
  );
  let previousDistance = 0;
  return records
    .filter((record) => !isSupersededRecordingEvidence(record.timestamp, orderedRewinds))
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((record) => {
      if (record.distance === undefined) return { ...record };
      const distance = rebaseRecordingDistance(
        record.distance,
        record.timestamp,
        orderedRewinds,
        previousDistance,
      );
      previousDistance = distance;
      return { ...record, distance };
    });
}

export function rebaseRecordingDistance(
  rawDistance: number,
  timestamp: number,
  rewindJournal: readonly RecordingRewindEvidenceBoundary[],
  previousDistance = 0,
): number {
  const activeRewind = [...rewindJournal]
    .sort((left, right) => Date.parse(right.rewoundAt) - Date.parse(left.rewoundAt))
    .find((rewind) => Date.parse(rewind.rewoundAt) <= timestamp);
  const candidate =
    activeRewind?.sourceDistanceMeters !== undefined &&
    activeRewind.destinationDistanceMeters !== undefined
      ? activeRewind.destinationDistanceMeters +
        Math.max(0, rawDistance - activeRewind.sourceDistanceMeters)
      : rawDistance;
  return Math.max(0, previousDistance, candidate);
}

export function isSupersededRecordingEvidence(
  timestamp: number,
  rewindJournal: readonly RecordingRewindEvidenceBoundary[],
): boolean {
  return rewindJournal.some(
    (rewind) =>
      timestamp >= Date.parse(rewind.supersededFrom) && timestamp < Date.parse(rewind.rewoundAt),
  );
}

export async function appendActivityRecorderFitRecord(input: {
  encoder: FitRecordSink;
  hasPlan: boolean;
  currentOccurrence: RecordingPlanOccurrence | undefined;
  timestamp: number;
  distance: number;
  readings: {
    speed?: number;
    heartRate?: number;
    cadence?: number;
    power?: number;
    temperature?: number;
    position?: { lat: number; lng: number; altitude?: number };
  };
}): Promise<boolean> {
  if (input.hasPlan && (!input.currentOccurrence || input.currentOccurrence.role === "rest")) {
    return false;
  }
  const record: FitRecord = {
    timestamp: input.timestamp,
    distance: input.distance,
    speed: input.readings.speed,
    heartRate: input.readings.heartRate,
    cadence: input.readings.cadence,
    power: input.readings.power,
    temperature: input.readings.temperature,
  };
  if (input.readings.position) {
    record.latitude = input.readings.position.lat;
    record.longitude = input.readings.position.lng;
    record.altitude = input.readings.position.altitude;
  }
  await input.encoder.addRecord(record);
  return true;
}
