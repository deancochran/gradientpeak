import { describe, expect, it } from "vitest";

import { getAllowedMobileAuthSchemePrefixes } from "./mobile-callback";

describe("getAllowedMobileAuthSchemePrefixes", () => {
  it("uses the same redirect-derived schemes for confirm and open routes", () => {
    expect(
      getAllowedMobileAuthSchemePrefixes({
        NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI: "custom-auth://callback",
      }),
    ).toContain("custom-auth://");
  });

  it("prefers an explicit allowlist when configured", () => {
    expect(
      getAllowedMobileAuthSchemePrefixes({
        APP_SCHEME: "ignored",
        AUTH_ALLOWED_DEEP_LINK_PREFIXES: "custom-one://, custom-two://",
      }),
    ).toEqual(["custom-one://", "custom-two://"]);
  });

  it("does not trust development or preview schemes by default in production", () => {
    expect(getAllowedMobileAuthSchemePrefixes({ NODE_ENV: "production" })).toEqual([
      "gradientpeak://",
    ]);
  });

  it("drops malformed and browser-executable configured schemes", () => {
    expect(
      getAllowedMobileAuthSchemePrefixes({
        AUTH_ALLOWED_DEEP_LINK_PREFIXES: "javascript://, https://, safe-app://",
      }),
    ).toEqual(["safe-app://"]);
  });
});
