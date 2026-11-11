import { describe, expect, it } from "vitest";
import { buildOnboardingDraftDefaults } from "./draft-defaults";

describe("buildOnboardingDraftDefaults", () => {
  it("restores only persisted identity for initial onboarding", () => {
    expect(
      buildOnboardingDraftDefaults({
        profile: {
          full_name: "Draft Athlete",
          username: "draft_athlete",
        },
      }),
    ).toEqual({
      full_name: "Draft Athlete",
      username: "draft_athlete",
    });
  });
});
