import { describe, expect, it } from "vitest";

import { completeOnboardingSchema } from "../onboarding";

describe("onboarding schema composition", () => {
  it("defaults experience level while preserving later optional fields", () => {
    expect(
      completeOnboardingSchema.parse({
        full_name: "Athlete Example",
        username: "athlete",
      }),
    ).toMatchObject({
      full_name: "Athlete Example",
      username: "athlete",
      experience_level: "skip",
      intents: [],
    });

    expect(
      completeOnboardingSchema.parse({
        full_name: "Athlete Example",
        username: "athlete",
        intents: ["train_event", "track_activities"],
      }).intents,
    ).toEqual(["train_event", "track_activities"]);

    expect(
      completeOnboardingSchema.parse({
        full_name: "Athlete Example",
        username: "athlete",
        planning_timezone: "Pacific/Auckland",
      }).planning_timezone,
    ).toBe("Pacific/Auckland");

    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Athlete Example",
        username: "athlete",
        planning_timezone: "PST",
      }).success,
    ).toBe(false);

    expect(
      completeOnboardingSchema.parse({
        full_name: "Athlete Example",
        username: "athlete",
        dob: "1990-02-03",
      }).dob,
    ).toBe("1990-02-03");
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Athlete Example",
        username: "athlete",
        dob: "1990-02-03T00:00:00.000Z",
      }).success,
    ).toBe(false);

    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Athlete Example",
        username: "athlete",
        intents: ["explore", "explore"],
      }).success,
    ).toBe(false);

    const result = completeOnboardingSchema.safeParse({
      max_hr: 180,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["full_name"],
        }),
        expect.objectContaining({
          path: ["username"],
        }),
      ]),
    );
  });

  it("keeps legacy payloads compatible and accepts strict baseline field sources", () => {
    expect(
      completeOnboardingSchema.parse({
        full_name: "Legacy Athlete",
        username: "legacy-athlete",
      }).baseline_field_sources,
    ).toBeUndefined();

    expect(
      completeOnboardingSchema.parse({
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        baseline_field_sources: {
          dob: "cleared",
          gender: "imported",
          weight_kg: "manual",
          max_hr: "estimated",
          resting_hr: "manual",
          ftp: "imported",
          threshold_pace_seconds_per_km: "cleared",
          css_seconds_per_hundred_meters: "estimated",
        },
      }).baseline_field_sources,
    ).toEqual({
      dob: "cleared",
      gender: "imported",
      weight_kg: "manual",
      max_hr: "estimated",
      resting_hr: "manual",
      ftp: "imported",
      threshold_pace_seconds_per_km: "cleared",
      css_seconds_per_hundred_meters: "estimated",
    });

    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        baseline_field_sources: { ftp: "guessed" },
      }).success,
    ).toBe(false);
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        baseline_field_sources: { vo2max: "manual" },
      }).success,
    ).toBe(false);
  });

  it.each([30, 300])("accepts canonical weight boundary %skg", (weight_kg) => {
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Weighted Athlete",
        username: "weighted-athlete",
        weight_kg,
      }).success,
    ).toBe(true);
  });

  it.each([29.99, 300.01])("rejects weight outside canonical bounds: %skg", (weight_kg) => {
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Weighted Athlete",
        username: "weighted-athlete",
        weight_kg,
      }).success,
    ).toBe(false);
  });
});
