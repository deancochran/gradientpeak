import { describe, expect, it } from "vitest";
import { profilePatchInputSchema } from "../forms/profile";

describe("profilePatchInputSchema", () => {
  it("is strict and permits an omitted patch", () => {
    expect(profilePatchInputSchema.parse({})).toEqual({});
    expect(profilePatchInputSchema.safeParse({ unsupported: true }).success).toBe(false);
  });

  it("preserves nulls for nullable profile fields", () => {
    expect(
      profilePatchInputSchema.parse({
        avatar_url: null,
        bio: null,
        cover_url: null,
        dob: null,
        language: null,
        planning_timezone: null,
        preferred_units: null,
      }),
    ).toMatchObject({
      avatar_url: null,
      bio: null,
      cover_url: null,
      dob: null,
      language: null,
      planning_timezone: null,
      preferred_units: null,
    });
  });

  it("accepts and trims a valid full name using onboarding validation", () => {
    expect(profilePatchInputSchema.parse({ full_name: "  Athlete Example  " })).toEqual({
      full_name: "Athlete Example",
    });
  });

  it("rejects blank full names", () => {
    expect(profilePatchInputSchema.safeParse({ full_name: "   " }).success).toBe(false);
  });

  it("keeps the existing username whitespace behavior", () => {
    expect(profilePatchInputSchema.parse({ username: "" }).username).toBeNull();
    expect(profilePatchInputSchema.parse({ username: "   " }).username).toBeNull();
    expect(profilePatchInputSchema.safeParse({ username: " athlete " }).success).toBe(false);
  });

  it("coerces numeric strings and maps blank metrics to tombstones", () => {
    expect(
      profilePatchInputSchema.parse({ weight_kg: "70.5", threshold_hr: "180", ftp: "300" }),
    ).toMatchObject({ weight_kg: 70.5, threshold_hr: 180, ftp: 300 });
    expect(profilePatchInputSchema.parse({ weight_kg: "", threshold_hr: " ", ftp: "" })).toEqual({
      weight_kg: null,
      threshold_hr: null,
      ftp: null,
    });
  });

  it("requires DOB patches to use the date-only contract", () => {
    expect(
      profilePatchInputSchema.parse({
        bio: "  untrimmed bio  ",
        dob: "1990-02-03",
        language: "  en  ",
      }),
    ).toEqual({ bio: "  untrimmed bio  ", dob: "1990-02-03", language: "  en  " });
    expect(profilePatchInputSchema.safeParse({ dob: "1990-02-03T00:00:00.000Z" }).success).toBe(
      false,
    );
    expect(profilePatchInputSchema.safeParse({ dob: "1990-02-31" }).success).toBe(false);
  });

  it("accepts only valid nullable IANA planning timezones", () => {
    expect(profilePatchInputSchema.parse({ planning_timezone: "America/Los_Angeles" })).toEqual({
      planning_timezone: "America/Los_Angeles",
    });
    expect(profilePatchInputSchema.safeParse({ planning_timezone: "PST" }).success).toBe(false);
  });
});
