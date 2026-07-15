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
});
