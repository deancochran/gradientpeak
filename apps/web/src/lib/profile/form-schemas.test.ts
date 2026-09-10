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
      settingsProfileFormSchema.safeParse({
        full_name: "Athlete",
        preferred_units: "imperial",
        username: "",
      }).success,
    ).toBe(true);
    expect(
      settingsProfileFormSchema.safeParse({
        full_name: "Athlete",
        preferred_units: "customary",
        username: "",
      }).success,
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
    formData.set("full_name", " Riley Chen ");
    formData.set("default_content_visibility", "followers");
    formData.set("dob", "1990-01-02");
    formData.set("is_public", "false");
    formData.set("language", " en ");
    formData.set("planning_timezone", " America/Los_Angeles ");
    formData.set("preferred_units", "imperial");
    formData.set("username", " athlete ");

    const values = settingsProfileFormSchema.parse(Object.fromEntries(formData.entries()));

    expect(toProfilePatchInput(values)).toEqual({
      bio: null,
      full_name: "Riley Chen",
      default_content_visibility: "followers",
      dob: "1990-01-02",
      is_public: false,
      language: "en",
      planning_timezone: "America/Los_Angeles",
      preferred_units: "imperial",
      username: "athlete",
    });
  });

  it("uses canonical patch validation and maps blank optional DOB and timezone fields to null", () => {
    expect(
      settingsProfileFormSchema.safeParse({
        dob: "not-a-date",
        full_name: "Athlete",
        planning_timezone: "Not/AZone",
        username: "",
      }).success,
    ).toBe(false);

    const values = settingsProfileFormSchema.parse({
      dob: "",
      full_name: "Athlete",
      planning_timezone: "   ",
      username: "",
    });

    expect(toProfilePatchInput(values)).toMatchObject({
      dob: null,
      planning_timezone: null,
    });
  });
});
