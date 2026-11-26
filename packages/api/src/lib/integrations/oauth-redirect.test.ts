import { describe, expect, it } from "vitest";
import { getDefaultMobileOAuthRedirect } from "./oauth-redirect";

describe("getDefaultMobileOAuthRedirect", () => {
  it("uses the installed development scheme outside production", () => {
    expect(getDefaultMobileOAuthRedirect({ NODE_ENV: "development" })).toBe(
      "gradientpeak-dev://integrations",
    );
  });

  it("keeps the production scheme as the production fallback", () => {
    expect(getDefaultMobileOAuthRedirect({ NODE_ENV: "production" })).toBe(
      "gradientpeak://integrations",
    );
  });

  it("prefers the explicitly configured callback", () => {
    expect(
      getDefaultMobileOAuthRedirect({
        NODE_ENV: "production",
        OAUTH_MOBILE_CALLBACK_URL: "gradientpeak-prev://integrations",
      }),
    ).toBe("gradientpeak-prev://integrations");
  });
});
