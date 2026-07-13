import { defaultPreferredUnitSystem } from "@repo/core/units";
import { describe, expect, it } from "vitest";
import { getSettingsProfileFormDefaults, settingsProfileFormSchema } from "./form-schemas";

describe("settings profile form", () => {
  it("accepts Core preferred-unit values and rejects unsupported values", () => {
    expect(
      settingsProfileFormSchema.safeParse({ preferred_units: "imperial", username: "" }).success,
    ).toBe(true);
    expect(
      settingsProfileFormSchema.safeParse({ preferred_units: "customary", username: "" }).success,
    ).toBe(false);
  });

  it("uses the Core default for absent or null preferred-unit values", () => {
    expect(getSettingsProfileFormDefaults().preferred_units).toBe(defaultPreferredUnitSystem);
    expect(getSettingsProfileFormDefaults({ preferred_units: null }).preferred_units).toBe(
      defaultPreferredUnitSystem,
    );
  });
});
