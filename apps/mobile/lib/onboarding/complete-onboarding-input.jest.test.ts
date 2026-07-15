import { INITIAL_ONBOARDING_DATA } from "@/components/onboarding/onboarding-data";
import { buildCompleteOnboardingInput } from "./complete-onboarding-input";

describe("buildCompleteOnboardingInput", () => {
  it("omits metadata for legacy callers", () => {
    const result = buildCompleteOnboardingInput({
      ...INITIAL_ONBOARDING_DATA,
      full_name: "Legacy Athlete",
      username: "legacy-athlete",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.baseline_field_sources).toBeUndefined();
  });

  it("maps explicit baseline field state into canonical transport metadata", () => {
    const result = buildCompleteOnboardingInput(
      {
        ...INITIAL_ONBOARDING_DATA,
        full_name: "Metadata Athlete",
        username: "metadata-athlete",
        dob: null,
        ftp: 220,
        max_hr: 185,
        weight_kg: 70,
      },
      {
        dob: { kind: "cleared" },
        ftp: { kind: "imported", label: "Wahoo" },
        max_hr: { kind: "estimated" },
        resting_hr: { kind: "cleared" },
        weight_kg: { kind: "manual" },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.baseline_field_sources).toEqual({
      dob: "cleared",
      ftp: "imported",
      max_hr: "estimated",
      resting_hr: "cleared",
      weight_kg: "manual",
    });
  });
});
