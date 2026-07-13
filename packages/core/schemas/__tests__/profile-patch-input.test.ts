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
        preferred_units: null,
      }),
    ).toMatchObject({
      avatar_url: null,
      bio: null,
      cover_url: null,
      dob: null,
      language: null,
      preferred_units: null,
    });
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

  it("keeps current raw API acceptance for bio, DOB, and language", () => {
    expect(
      profilePatchInputSchema.parse({
        bio: "  untrimmed bio  ",
        dob: "not-a-date",
        language: "  en  ",
      }),
    ).toEqual({ bio: "  untrimmed bio  ", dob: "not-a-date", language: "  en  " });
  });
});
