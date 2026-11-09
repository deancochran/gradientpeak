import { describe, expect, it } from "vitest";
import {
  GarminActivityPushValidationError,
  parseGarminActivityFileCallbackUrl,
  parseGarminActivityPush,
} from "./activity-push";

const activityFileUrl =
  "https://apis.garmin.com/wellness-api/rest/activityFile?id=activity-1&token=download-token";

describe("Garmin Activity PUSH contract", () => {
  it("parses documented list types, known finite fields, and unknown provider fields", () => {
    const payload = parseGarminActivityPush({
      activities: [
        {
          userId: "garmin-user-a",
          summaryId: "summary-a",
          durationInSeconds: 3600,
          averageSpeedInMetersPerSecond: 2.8,
          futureProviderField: { preserved: true },
        },
      ],
      activityDetails: [
        {
          userId: "garmin-user-b",
          summaryId: "summary-b-detail",
          summary: { startTimeInSeconds: 1_617_717_902, distanceInMeters: 42.5 },
          samples: [{ startTimeInSeconds: 1_617_717_902, heartRate: 120 }],
        },
      ],
      activityFiles: [
        {
          userId: "garmin-user-c",
          summaryId: "summary-c-file",
          fileType: "FIT",
          callbackURL: activityFileUrl,
          manual: false,
        },
      ],
      manuallyUpdatedActivities: [
        { userId: "garmin-user-d", summaryId: "summary-d", manual: true },
      ],
      futureTopLevelList: [],
    });

    expect(payload.activities?.[0]).toMatchObject({
      userId: "garmin-user-a",
      futureProviderField: { preserved: true },
    });
    expect(payload.activityDetails?.[0]?.summary.distanceInMeters).toBe(42.5);
    expect(payload.activityFiles?.[0]?.callbackURL).toBe(activityFileUrl);
  });

  it("retains per-record identities for a mixed-user batch", () => {
    const payload = parseGarminActivityPush({
      activities: [
        { userId: "first-user", summaryId: "first-summary" },
        { userId: "second-user", summaryId: "second-summary" },
      ],
    });

    expect(payload.activities?.map(({ userId, summaryId }) => ({ userId, summaryId }))).toEqual([
      { userId: "first-user", summaryId: "first-summary" },
      { userId: "second-user", summaryId: "second-summary" },
    ]);
  });

  it.each([
    { activities: [{ summaryId: "missing-user" }] },
    { activities: [{ userId: "missing-summary" }] },
    { activities: [{ userId: "user", summaryId: "summary", distanceInMeters: Number.NaN }] },
    {
      activityDetails: [
        { userId: "user", summaryId: "detail", summary: { durationInSeconds: 1.5 } },
      ],
    },
    {
      activityFiles: [
        {
          userId: "user",
          summaryId: "file",
          fileType: "FIT",
          callbackURL: activityFileUrl,
          startTimeInSeconds: Infinity,
        },
      ],
    },
  ])("rejects malformed records", (payload) => {
    expect(() => parseGarminActivityPush(payload)).toThrow(GarminActivityPushValidationError);
  });

  it.each([
    "http://apis.garmin.com/wellness-api/rest/activityFile?id=1",
    "https://attacker.example/wellness-api/rest/activityFile?id=1",
    "https://apis.garmin.com.evil.example/wellness-api/rest/activityFile?id=1",
    "https://user@apis.garmin.com/wellness-api/rest/activityFile?id=1",
    "https://apis.garmin.com:443/wellness-api/rest/activityFile?id=1",
    "https://apis.garmin.com/wellness-api/rest/activityFiles?id=1",
    "https://apis.garmin.com/wellness-api/rest/activityFile?id=1#fragment",
  ])("rejects unsafe Activity File callback URLs without exposing them", (callbackURL) => {
    expect(() => parseGarminActivityFileCallbackUrl(callbackURL)).toThrow(
      GarminActivityPushValidationError,
    );
    try {
      parseGarminActivityPush({
        activityFiles: [{ userId: "user", summaryId: "file", fileType: "FIT", callbackURL }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GarminActivityPushValidationError);
      expect((error as Error).message).not.toContain(callbackURL);
    }
  });

  it("accepts only the documented Activity File route", () => {
    expect(parseGarminActivityFileCallbackUrl(activityFileUrl).pathname).toBe(
      "/wellness-api/rest/activityFile",
    );
  });
});
