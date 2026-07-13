import { defaultPreferredUnitSystem } from "@repo/core/units";
import { describe, expect, it } from "vitest";
import { getProfileEditFormDefaults, toProfilePatchInput } from "../profile-edit-form";

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

  it("maps mobile blanks and visibility to the canonical patch without changing defaults", () => {
    expect(
      toProfilePatchInput({
        username: "",
        bio: "",
        dob: "",
        preferred_units: null,
        language: "",
        is_public: null,
      }),
    ).toEqual({
      username: null,
      bio: null,
      dob: null,
      preferred_units: null,
      language: null,
      is_public: undefined,
    });
  });
});
