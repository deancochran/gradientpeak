import { INITIAL_ONBOARDING_DATA } from "@/components/onboarding/onboarding-data";
import { buildCompleteOnboardingInput } from "./complete-onboarding-input";

describe("buildCompleteOnboardingInput", () => {
  it("emits normalized identity, selected timezone, and shared contract defaults", () => {
    const result = buildCompleteOnboardingInput({
      ...INITIAL_ONBOARDING_DATA,
      full_name: "  New Athlete  ",
      username: "new_athlete",
      planning_timezone: "Pacific/Chatham",
      max_hr: 185,
      intent: ["train_event"],
    });

    expect(result).toEqual({
      ok: true,
      input: {
        baseline_field_sources: {},
        experience_level: "skip",
        full_name: "New Athlete",
        intents: [],
        username: "new_athlete",
        planning_timezone: "Pacific/Chatham",
      },
      profile: { full_name: "New Athlete", username: "new_athlete" },
    });
  });

  it("rejects identity that the API contract rejects", () => {
    const result = buildCompleteOnboardingInput({
      ...INITIAL_ONBOARDING_DATA,
      full_name: "New Athlete",
      username: "bad-name",
    });

    expect(result).toEqual({
      ok: false,
      error: "Username can only contain letters, numbers, and underscores",
    });
  });
});
