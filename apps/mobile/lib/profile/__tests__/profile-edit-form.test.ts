import { defaultPreferredUnitSystem } from "@repo/core/units";
import { describe, expect, it } from "vitest";
import { getProfileEditFormDefaults } from "../profile-edit-form";

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
});
