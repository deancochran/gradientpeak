import { INITIAL_ONBOARDING_DATA } from "@/components/onboarding/onboarding-data";
import { buildCompleteOnboardingInput } from "./complete-onboarding-input";

describe("buildCompleteOnboardingInput", () => {
  it("emits an empty metadata object when no baseline sources are selected", () => {
    const result = buildCompleteOnboardingInput({
      ...INITIAL_ONBOARDING_DATA,
      full_name: "New Athlete",
      username: "new-athlete",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.baseline_field_sources).toEqual({});
  });

  it("maps explicit baseline field state into canonical transport metadata", () => {
    const result = buildCompleteOnboardingInput(
      {
        ...INITIAL_ONBOARDING_DATA,
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        dob: null,
        max_hr: 185,
        weight_kg: 70,
      },
      {
        dob: { kind: "cleared" },
        max_hr: { kind: "estimated" },
        resting_hr: { kind: "cleared" },
        weight_kg: { kind: "manual" },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.baseline_field_sources).toEqual({
      dob: "cleared",
      max_hr: "estimated",
      resting_hr: "cleared",
      weight_kg: "manual",
    });
  });
});
