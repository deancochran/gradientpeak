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
    });

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
