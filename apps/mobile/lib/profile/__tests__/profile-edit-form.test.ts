import { defaultPreferredUnitSystem } from "@repo/core/units";
import { describe, expect, it } from "vitest";
import {
  getProfileEditFormDefaults,
  profileEditFormSchema,
  toProfilePatchInput,
} from "../profile-edit-form";

describe("profile edit form defaults", () => {
  it("uses the Core default for absent or null preferred-unit values", () => {
    expect(getProfileEditFormDefaults().preferred_units).toBe(defaultPreferredUnitSystem);
    expect(getProfileEditFormDefaults({ preferred_units: null }).preferred_units).toBe(
      defaultPreferredUnitSystem,
    );
  });

  it("preserves valid persisted preferred-unit values", () => {
    expect(getProfileEditFormDefaults({ preferred_units: "imperial" }).preferred_units).toBe(
      "imperial",
    );
  });

  it("loads the persisted full name and requires a non-blank canonical identity", () => {
    expect(getProfileEditFormDefaults({ full_name: "Riley Chen" }).full_name).toBe("Riley Chen");
    expect(profileEditFormSchema.shape.full_name.safeParse("   ").success).toBe(false);
    expect(profileEditFormSchema.shape.full_name.parse("  Riley Chen  ")).toBe("Riley Chen");
  });

  it("maps mobile blanks and visibility to the canonical patch without changing defaults", () => {
    expect(
      toProfilePatchInput({
        full_name: "Riley Chen",
        username: "",
        bio: "",
        dob: "",
        default_content_visibility: "followers",
        preferred_units: null,
        language: "",
        is_public: null,
        planning_timezone: null,
      }),
    ).toEqual({
      full_name: "Riley Chen",
      username: null,
      bio: null,
      dob: null,
      default_content_visibility: "followers",
      preferred_units: null,
      language: null,
      is_public: undefined,
      planning_timezone: null,
    });
  });
});
