import { describe, expect, it } from "vitest";

import { getAllowedMobileAuthSchemePrefixes } from "./mobile-callback";

describe("getAllowedMobileAuthSchemePrefixes", () => {
  it("derives an allowed scheme from the canonical auth callback URL", () => {
    expect(
      getAllowedMobileAuthSchemePrefixes({
        AUTH_MOBILE_CALLBACK_URL: "custom-auth://callback",
      }),
    ).toContain("custom-auth://");
  });

  it("prefers an explicit allowlist when configured", () => {
    expect(
      getAllowedMobileAuthSchemePrefixes({
        AUTH_MOBILE_SCHEME: "ignored",
        AUTH_ALLOWED_DEEP_LINK_PREFIXES: "custom-one://, custom-two://",
      }),
    ).toEqual(["custom-one://", "custom-two://"]);
  });

  it("fails closed when production has no explicit deep-link allowlist", () => {
    expect(getAllowedMobileAuthSchemePrefixes({ NODE_ENV: "production" })).toEqual([]);
  });

  it("drops malformed and browser-executable configured schemes", () => {
    expect(
      getAllowedMobileAuthSchemePrefixes({
        AUTH_ALLOWED_DEEP_LINK_PREFIXES: "javascript://, https://, safe-app://",
      }),
    ).toEqual(["safe-app://"]);
  });
});
