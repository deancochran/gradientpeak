import { describe, expect, it } from "vitest";

import { parseOnboardingFormData } from "./form-data";

describe("parseOnboardingFormData", () => {
  it("builds an identity-only completion payload and ignores removed initial setup fields", () => {
    const form = new FormData();
    form.set("full_name", "  Web Athlete  ");
    form.set("username", "web_athlete");
    form.set("goal_title", "Not part of initial onboarding");
    form.set("max_hr", "188");
    form.append("group_ids", "00000000-0000-4000-8000-000000000002");

    expect(parseOnboardingFormData(form)).toEqual({
      profile: {
        baseline_field_sources: {},
        experience_level: "skip",
        full_name: "Web Athlete",
        intents: [],
        username: "web_athlete",
      },
      redirect: "/",
    });
  });

  it("uses the shared identity contract", () => {
    const form = new FormData();
    form.set("full_name", "Web Athlete");
    form.set("username", "bad-name");

    expect(() => parseOnboardingFormData(form)).toThrow(
      "Username can only contain letters, numbers, and underscores",
    );
  });
});
