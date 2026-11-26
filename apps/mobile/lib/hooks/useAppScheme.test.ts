import { isAllowedMobileCallbackUrl } from "@repo/auth/callbacks";
import { describe, expect, it } from "vitest";

import { getAppScheme } from "./useAppScheme";

const allowedSchemePrefixes = ["gradientpeak://", "gradientpeak-dev://", "gradientpeak-prev://"];

describe("mobile auth callback scheme contract", () => {
  it.each([
    ["development", "gradientpeak-dev"],
    ["preview", "gradientpeak-prev"],
    ["production", "gradientpeak"],
  ] as const)("maps %s to a web-confirm accepted callback host", (environment, expectedScheme) => {
    const previousEnvironment = process.env.APP_ENV;
    process.env.APP_ENV = environment;

    try {
      const scheme = getAppScheme();

      expect(scheme).toBe(expectedScheme);
      expect(
        isAllowedMobileCallbackUrl(`${scheme}://callback?intent=email-verification`, {
          allowedSchemePrefixes,
          callbackPath: "callback",
        }),
      ).toBe(true);
    } finally {
      if (previousEnvironment === undefined) {
        delete process.env.APP_ENV;
      } else {
        process.env.APP_ENV = previousEnvironment;
      }
    }
  });
});
