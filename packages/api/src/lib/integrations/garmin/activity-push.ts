import { z } from "zod";

/**
 * A local resource bound, not a Garmin-published batch limit. It protects the
 * future HTTP boundary without assigning ownership to an entire batch.
 */
export const GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST = 1_000;

const boundedString = z.string().min(1).max(4_096);
const finiteNumber = z.number().finite();
const finiteInteger = finiteNumber.int();
const activityId = z.union([boundedString, finiteInteger]);

const activitySummaryFields = {
  // The table says string, while Garmin's own examples show a number.
  activityId: activityId.optional(),
  activityName: boundedString.optional(),
  activityType: boundedString.optional(),
  activeKilocalories: finiteInteger.optional(),
  averageBikeCadenceInRoundsPerMinute: finiteNumber.optional(),
  averageHeartRateInBeatsPerMinute: finiteInteger.optional(),
  averagePaceInMinutesPerKilometer: finiteNumber.optional(),
  averagePushCadenceInPushesPerMinute: finiteNumber.optional(),
  averageRunCadenceInStepsPerMinute: finiteNumber.optional(),
  averageSpeedInMetersPerSecond: finiteNumber.optional(),
  averageSwimCadenceInStrokesPerMinute: finiteNumber.optional(),
  deviceName: boundedString.optional(),
  distanceInMeters: finiteNumber.optional(),
  durationInSeconds: finiteInteger.optional(),
  isParent: z.boolean().optional(),
  isWebUpload: z.boolean().optional(),
  manual: z.boolean().optional(),
  maxBikeCadenceInRoundsPerMinute: finiteNumber.optional(),
  maxHeartRateInBeatsPerMinute: finiteNumber.optional(),
  maxPaceInMinutesPerKilometer: finiteNumber.optional(),
  maxPushCadenceInPushesPerMinute: finiteNumber.optional(),
  maxRunCadenceInStepsPerMinute: finiteNumber.optional(),
  maxSpeedInMetersPerSecond: finiteNumber.optional(),
  numberOfActiveLengths: finiteInteger.optional(),
  parentSummaryId: boundedString.optional(),
  pushes: finiteInteger.optional(),
  startTimeInSeconds: finiteInteger.optional(),
  startTimeOffsetInSeconds: finiteInteger.optional(),
  startingLatitudeInDegree: finiteNumber.optional(),
  startingLongitudeInDegree: finiteNumber.optional(),
  steps: finiteInteger.optional(),
  totalElevationGainInMeters: finiteNumber.optional(),
  totalElevationLossInMeters: finiteNumber.optional(),
} as const;

const activitySummarySchema = z.object(activitySummaryFields).passthrough();

const activityDetailSampleSchema = z
  .object({
    airTemperatureCelcius: finiteNumber.optional(),
    bikeCadenceInRPM: finiteNumber.optional(),
    clockDurationInSeconds: finiteInteger.optional(),
    directWheelchairCadence: finiteNumber.optional(),
    elevationInMeters: finiteNumber.optional(),
    heartRate: finiteInteger.optional(),
    latitudeInDegree: finiteNumber.optional(),
    longitudeInDegree: finiteNumber.optional(),
    movingDurationInSeconds: finiteInteger.optional(),
    powerInWatts: finiteNumber.optional(),
    speedMetersPerSecond: finiteNumber.optional(),
    startTimeInSeconds: finiteInteger.optional(),
    stepsPerMinute: finiteNumber.optional(),
    swimCadenceInStrokesPerMinute: finiteNumber.optional(),
    timerDurationInSeconds: finiteInteger.optional(),
    totalDistanceInMeters: finiteNumber.optional(),
  })
  .passthrough();

const activityDetailsSchema = z
  .object({
    summaryId: boundedString,
    userId: boundedString,
    laps: z
      .array(z.object({ startTimeInSeconds: finiteInteger.optional() }).passthrough())
      .max(GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST)
      .optional(),
    samples: z
      .array(activityDetailSampleSchema)
      .max(GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST)
      .optional(),
    summary: activitySummarySchema,
  })
  .passthrough();

function isDocumentedActivityFileCallbackUrl(value: string): boolean {
  // Check the serialized authority as URL normalizes an explicit default port.
  if (!/^https:\/\/apis\.garmin\.com(?:[/?#]|$)/i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "apis.garmin.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.pathname === "/wellness-api/rest/activityFile"
    );
  } catch {
    return false;
  }
}

const activityFileCallbackUrlSchema = boundedString.refine(isDocumentedActivityFileCallbackUrl, {
  message: "invalid Garmin Activity File callback URL",
});

const activityFilesSchema = z
  .object({
    summaryId: boundedString,
    userId: boundedString,
    activityDescription: boundedString.optional(),
    activityId: activityId.optional(),
    activityName: boundedString.optional(),
    activityType: boundedString.optional(),
    callbackURL: activityFileCallbackUrlSchema,
    deviceName: boundedString.optional(),
    fileType: z.enum(["FIT", "GPX", "TCX"]),
    manual: z.boolean().optional(),
    startTimeInSeconds: finiteInteger.optional(),
  })
  .passthrough();

const activityListSchema = z
  .array(
    z
      .object({ summaryId: boundedString, userId: boundedString, ...activitySummaryFields })
      .passthrough(),
  )
  .max(GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST);

const manuallyUpdatedActivitiesSchema = z
  .array(
    z
      .object({ summaryId: boundedString, userId: boundedString, ...activitySummaryFields })
      .passthrough(),
  )
  .max(GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST);

const pushSchema = z
  .object({
    activities: activityListSchema.optional(),
    activityDetails: z
      .array(activityDetailsSchema)
      .max(GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST)
      .optional(),
    activityFiles: z
      .array(activityFilesSchema)
      .max(GARMIN_ACTIVITY_PUSH_MAX_RECORDS_PER_LIST)
      .optional(),
    manuallyUpdatedActivities: manuallyUpdatedActivitiesSchema.optional(),
  })
  .passthrough();

export type GarminActivityPush = z.infer<typeof pushSchema>;
export type GarminActivityFilePushRecord = z.infer<typeof activityFilesSchema>;

/** A deliberately opaque error: callback URLs can contain download tokens. */
export class GarminActivityPushValidationError extends Error {
  constructor() {
    super("Garmin Activity PUSH payload is invalid");
    this.name = "GarminActivityPushValidationError";
  }
}

/**
 * Parses only documented Activity PUSH list shapes. This has no authentication,
 * endpoint, queue, storage, or download behavior.
 */
export function parseGarminActivityPush(payload: unknown): GarminActivityPush {
  const parsed = pushSchema.safeParse(payload);
  if (!parsed.success) throw new GarminActivityPushValidationError();
  return parsed.data;
}

/**
 * Returns a URL only after enforcing Garmin's documented Activity File origin
 * and route. Callers must still treat its query string as a secret.
 */
export function parseGarminActivityFileCallbackUrl(value: unknown): URL {
  const parsed = activityFileCallbackUrlSchema.safeParse(value);
  if (!parsed.success) throw new GarminActivityPushValidationError();
  return new URL(parsed.data);
}
