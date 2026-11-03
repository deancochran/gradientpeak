import { afterEach, describe, expect, it } from "vitest";
import { getPublicShareUrl } from "./public-share-url";

const originalPublicWebUrl = process.env.EXPO_PUBLIC_WEB_URL;

afterEach(() => {
  if (originalPublicWebUrl === undefined) {
    delete process.env.EXPO_PUBLIC_WEB_URL;
  } else {
    process.env.EXPO_PUBLIC_WEB_URL = originalPublicWebUrl;
  }
});

describe("getPublicShareUrl", () => {
  it("uses the configured public web origin", () => {
    process.env.EXPO_PUBLIC_WEB_URL = "https://share.gradientpeak.test/ignored-path";

    expect(getPublicShareUrl("/share/routes/route-1")).toBe(
      "https://share.gradientpeak.test/share/routes/route-1",
    );
  });

  it("uses the production web origin when configuration is absent or invalid", () => {
    delete process.env.EXPO_PUBLIC_WEB_URL;
    expect(getPublicShareUrl("share/activities/activity-1")).toBe(
      "https://gradientpeak.app/share/activities/activity-1",
    );

    process.env.EXPO_PUBLIC_WEB_URL = "gradientpeak-dev://invalid";
    expect(getPublicShareUrl("/share/training-plans/plan-1")).toBe(
      "https://gradientpeak.app/share/training-plans/plan-1",
    );
  });
});
