import { describe, it, expect } from "vitest";
import {
  getBaselineProfile,
  calculateAge,
  mergeWithBaseline,
} from "../baseline-profiles";

describe("getBaselineProfile", () => {
  it("should return null for skip experience level", () => {
    const profile = getBaselineProfile("skip", 70, "male", 30, "cycling");
    expect(profile).toBeNull();
  });

  it("should return null for advanced experience level", () => {
    const profile = getBaselineProfile("advanced", 70, "male", 30, "cycling");
    expect(profile).toBeNull();
  });

  it("should return baseline profile for beginner cyclist", () => {
    const profile = getBaselineProfile("beginner", 70, "male", 30, "cycling");

    expect(profile).not.toBeNull();
    expect(profile!.max_hr).toBe(190); // 220 - 30
    expect(profile!.resting_hr).toBe(70); // Beginner male
    expect(profile!.lthr).toBe(162); // 85% of 190
    expect(profile!.vo2_max).toBeGreaterThan(0);
    expect(profile!.ftp).toBe(140); // 70kg * 2.0 W/kg
    expect(profile!.confidence).toBe("low");
    expect(profile!.source).toBe("baseline_beginner");
  });

  it("should return baseline profile for intermediate runner", () => {
    const profile = getBaselineProfile(
      "intermediate",
      65,
      "female",
      35,
      "running",
    );

    expect(profile).not.toBeNull();
    expect(profile!.max_hr).toBe(185); // 220 - 35
    expect(profile!.resting_hr).toBe(65); // Intermediate female
    expect(profile!.threshold_pace_seconds_per_km).toBe(345); // 5:45/km
    expect(profile!.confidence).toBe("medium");
    expect(profile!.source).toBe("baseline_intermediate");
  });

  it("should return baseline profile for triathlete with all metrics", () => {
    const profile = getBaselineProfile(
      "intermediate",
      70,
      "male",
      30,
      "triathlon",
    );

    expect(profile).not.toBeNull();
    expect(profile!.ftp).toBeDefined(); // Should have cycling metric
    expect(profile!.threshold_pace_seconds_per_km).toBeDefined(); // Should have running metric
    expect(profile!.css_seconds_per_hundred_meters).toBeDefined(); // Should have swimming metric
  });

  it("should have higher FTP for heavier athletes", () => {
    const lightProfile = getBaselineProfile(
      "intermediate",
      60,
      "male",
      30,
      "cycling",
    );
    const heavyProfile = getBaselineProfile(
      "intermediate",
      80,
      "male",
      30,
      "cycling",
    );

    expect(heavyProfile!.ftp).toBeGreaterThan(lightProfile!.ftp!);
  });

  it("should have lower resting HR for intermediate vs beginner", () => {
    const beginnerProfile = getBaselineProfile(
      "beginner",
      70,
      "male",
      30,
      "cycling",
    );
    const intermediateProfile = getBaselineProfile(
      "intermediate",
      70,
      "male",
      30,
      "cycling",
    );

    expect(intermediateProfile!.resting_hr).toBeLessThan(
      beginnerProfile!.resting_hr,
    );
  });
});

describe("calculateAge", () => {
  it("should calculate age from date of birth", () => {
    const dob = "1990-01-01T00:00:00Z";
    const age = calculateAge(dob);
    expect(age).toBeGreaterThanOrEqual(34); // As of 2024+
  });

  it("should work with Date objects", () => {
    const dob = new Date("1990-01-01");
    const age = calculateAge(dob);
    expect(age).toBeGreaterThanOrEqual(34);
  });

  it("should handle birthdays not yet occurred this year", () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const age = calculateAge(nextMonth);
    expect(age).toBeLessThan(0); // Should be negative for future dates
  });
});

describe("mergeWithBaseline", () => {
  it("should prioritize user values over baseline", () => {
    const baseline = getBaselineProfile(
      "intermediate",
      70,
      "male",
      30,
      "cycling",
    );
    const userMetrics = {
      ftp: 300, // User override
    };

    const merged = mergeWithBaseline(userMetrics, baseline);

    expect(merged.ftp).toBe(300); // User value
    expect(merged.max_hr).toBe(baseline!.max_hr); // From baseline
    expect(merged.resting_hr).toBe(baseline!.resting_hr); // From baseline
  });

  it("should return user metrics when baseline is null", () => {
    const userMetrics = {
      ftp: 250,
      max_hr: 190,
    };

    const merged = mergeWithBaseline(userMetrics, null);

    expect(merged.ftp).toBe(250);
    expect(merged.max_hr).toBe(190);
  });

  it("should fill in missing user values from baseline", () => {
    const baseline = getBaselineProfile(
      "intermediate",
      70,
      "male",
      30,
      "cycling",
    );
    const userMetrics = {
      ftp: 250, // Only FTP provided
    };

    const merged = mergeWithBaseline(userMetrics, baseline);

    expect(merged.ftp).toBe(250); // User value
    expect(merged.max_hr).toBe(baseline!.max_hr); // From baseline
    expect(merged.resting_hr).toBe(baseline!.resting_hr); // From baseline
    expect(merged.lthr).toBe(baseline!.lthr); // From baseline
    expect(merged.vo2_max).toBe(baseline!.vo2_max); // From baseline
  });
});
