import { describe, expect, it } from "vitest";

import { completeOnboardingSchema } from "../onboarding";

describe("onboarding schema composition", () => {
  it("keeps step 1 fields required while preserving later optional fields", () => {
    expect(
      completeOnboardingSchema.parse({
        experience_level: "beginner",
      }),
    ).toMatchObject({
      experience_level: "beginner",
    });

    const result = completeOnboardingSchema.safeParse({
      max_hr: 180,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["experience_level"],
        }),
      ]),
    );
  });
});
