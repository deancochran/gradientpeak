import { describe, expect, it } from "vitest";

import {
  getProfileDisplayName,
  getProfileInitials,
  getProfileQuickUpdateDefaults,
  normalizeProfileSettingsView,
  normalizeProfileSummary,
} from "../index";

describe("profile adapters", () => {
  it("normalizes profile settings views for app forms", () => {
    const normalized = normalizeProfileSettingsView({
      ftp: 280,
      is_public: null,
      threshold_hr: 172,
      username: "dean",
      weight_kg: 72.5,
    });

    expect(normalized).toEqual({
      avatar_url: null,
      ftp: 280,
      is_public: false,
      threshold_hr: 172,
      username: "dean",
      weight_kg: 72.5,
    });
  });

  it("builds quick-update defaults with safe fallbacks", () => {
    expect(getProfileQuickUpdateDefaults(null)).toEqual({
      ftp: undefined,
      is_public: false,
      threshold_hr: undefined,
      username: "",
      weight_kg: undefined,
    });
  });

  it("derives profile display labels consistently", () => {
    const profile = normalizeProfileSummary({
      full_name: "Dean Cochran",
      username: "gradientpeak",
    });

    expect(getProfileDisplayName(profile)).toBe("Dean Cochran");
    expect(getProfileInitials(profile)).toBe("DC");
  });
});
