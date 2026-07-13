import { defaultPreferredUnitSystem } from "@repo/core/units";
import { describe, expect, it } from "vitest";
import {
  getSettingsProfileFormDefaults,
  settingsProfileFormSchema,
  toProfilePatchInput,
} from "./form-schemas";

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

  it("preserves FormData parsing and maps web blanks to the canonical patch", () => {
    const formData = new FormData();
    formData.set("bio", "  ");
    formData.set("is_public", "false");
    formData.set("language", " en ");
    formData.set("preferred_units", "imperial");
    formData.set("username", " athlete ");

    const values = settingsProfileFormSchema.parse(Object.fromEntries(formData.entries()));

    expect(toProfilePatchInput(values)).toEqual({
      bio: null,
      is_public: false,
      language: "en",
      preferred_units: "imperial",
      username: "athlete",
    });
  });
});
