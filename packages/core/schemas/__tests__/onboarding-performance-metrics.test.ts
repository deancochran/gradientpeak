import { describe, expect, it } from "vitest";

import { onboardingStep3Schema } from "../onboarding";

describe("onboarding performance metric thresholds", () => {
  it.each([
    ["ftp", 20],
    ["ftp", 700],
    ["threshold_pace_seconds_per_km", 120],
    ["threshold_pace_seconds_per_km", 1_200],
    ["css_seconds_per_hundred_meters", 45],
    ["css_seconds_per_hundred_meters", 600],
  ] as const)("accepts %s boundary value %s", (field, value) => {
    expect(onboardingStep3Schema.safeParse({ [field]: value }).success).toBe(true);
  });

  it.each([
    ["ftp", 19, "FTP must be at least 20W"],
    ["ftp", 701, "FTP must be at most 700W"],
    ["threshold_pace_seconds_per_km", 119, "Threshold pace must be no faster than 2:00/km"],
    ["threshold_pace_seconds_per_km", 1_201, "Threshold pace must be no slower than 20:00/km"],
    ["css_seconds_per_hundred_meters", 44, "CSS must be no faster than 0:45/100m"],
    ["css_seconds_per_hundred_meters", 601, "CSS must be no slower than 10:00/100m"],
  ] as const)("rejects %s value %s with an accurate message", (field, value, message) => {
    const result = onboardingStep3Schema.safeParse({ [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
