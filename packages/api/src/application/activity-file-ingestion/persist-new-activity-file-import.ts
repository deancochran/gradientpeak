import type { getRequiredDb } from "../../db";
import { type ActivitySubmission, submitActivity } from "../activities/submit-activity";

type DbClient = ReturnType<typeof getRequiredDb>;

export interface PersistNewActivityFileImportInput {
  requestedActivityId?: string;
  profileId: string;
  name: string;
  notes: string | null;
  activityType: string;
  isPrivate: boolean;
  startedAt: Date;
  finishedAt: Date;
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  activityFilePath: string;
  activityFileSize: number;
  importSource: string | null;
  importFileType: string | null;
  importOriginalFileName: string | null;
  calories: number | null;
  elevationGainMeters: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgPower: number | null;
  maxPower: number | null;
  normalizedPower: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  normalizedSpeedMps: number | null;
  normalizedGradedSpeedMps: number | null;
  efficiencyFactor: number | null;
  aerobicDecoupling: number | null;
  avgTemperature: number | null;
  deviceManufacturer: unknown;
  deviceProduct: unknown;
  laps: unknown[] | null;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  polyline: string | null;
  analysis?: ActivitySubmission["analysis"];
}

export async function persistNewActivityFileImport(
  db: DbClient,
  input: PersistNewActivityFileImportInput,
) {
  const activity = await submitActivity(db, input);
  return db.query.activities.findFirst({
    where: (activities, { eq }) => eq(activities.id, activity.id),
  });
}
