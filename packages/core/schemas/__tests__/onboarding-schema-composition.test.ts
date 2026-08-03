import { describe, expect, it } from "vitest";

import { completeOnboardingSchema } from "../onboarding";

describe("onboarding schema composition", () => {
  it("defaults experience level while preserving later optional fields", () => {
    expect(
      completeOnboardingSchema.parse({
        full_name: "Athlete Example",
        username: "athlete",
        baseline_field_sources: {},
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
        baseline_field_sources: {},
      }).intents,
    ).toEqual(["train_event", "track_activities"]);

    expect(
      completeOnboardingSchema.parse({
        full_name: "Athlete Example",
        username: "athlete",
        planning_timezone: "Pacific/Auckland",
        baseline_field_sources: {},
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
        baseline_field_sources: {},
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
        baseline_field_sources: {},
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

  it("requires strict baseline field sources on current completion payloads", () => {
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
      }).success,
    ).toBe(false);

    expect(
      completeOnboardingSchema.parse({
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        baseline_field_sources: {},
      }).baseline_field_sources,
    ).toEqual({});

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
        },
      }).baseline_field_sources,
    ).toEqual({
      dob: "cleared",
      gender: "imported",
      weight_kg: "manual",
      max_hr: "estimated",
      resting_hr: "manual",
    });

    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        baseline_field_sources: { ftp: "imported" },
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

  it.each([
    "lthr",
    "ftp",
    "threshold_pace_seconds_per_km",
    "css_seconds_per_hundred_meters",
  ])("rejects removed onboarding threshold field %s", (field) => {
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Current Athlete",
        username: "current-athlete",
        [field]: 200,
      }).success,
    ).toBe(false);
  });

  it.each([30, 300])("accepts canonical weight boundary %skg", (weight_kg) => {
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Weighted Athlete",
        username: "weighted-athlete",
        weight_kg,
        baseline_field_sources: {},
      }).success,
    ).toBe(true);
  });

  it.each([29.99, 300.01])("rejects weight outside canonical bounds: %skg", (weight_kg) => {
    expect(
      completeOnboardingSchema.safeParse({
        full_name: "Weighted Athlete",
        username: "weighted-athlete",
        weight_kg,
        baseline_field_sources: {},
      }).success,
    ).toBe(false);
  });
});
