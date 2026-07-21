import { describe, expect, it } from "vitest";

import {
  isAllowedMobileCallbackUrl,
  resolveAuthCallbackRedirect,
  sanitizeWebCallbackPath,
} from "./callbacks";

const appUrl = "https://app.example";

describe("sanitizeWebCallbackPath", () => {
  it.each([
    "//attacker.example/collect",
    "/\\attacker.example/collect",
    "https://attacker.example/collect",
  ])("rejects cross-origin callback target %s", (candidate) => {
    expect(sanitizeWebCallbackPath(candidate, appUrl, "/auth/login")).toBe("/auth/login");
  });

  it("preserves same-origin path, query, and hash", () => {
    expect(
      sanitizeWebCallbackPath(
        "https://app.example/settings?updated=profile#account",
        appUrl,
        "/auth/login",
      ),
    ).toBe("/settings?updated=profile#account");
  });
});

describe("resolveAuthCallbackRedirect", () => {
  it("falls back safely when next is protocol-relative", () => {
    expect(
      resolveAuthCallbackRedirect(
        {
          fallback: "/auth/login",
          intent: "post-sign-in",
          next: "//attacker.example/collect",
          target: "web",
        },
        {
          appUrl,
          loginPath: "/auth/login",
          mobileCallbackPath: "callback",
          mobileScheme: "gradientpeak",
        },
      ),
    ).toBe("/auth/login");
  });
});

describe("isAllowedMobileCallbackUrl", () => {
  const options = {
    allowedSchemePrefixes: ["gradientpeak://", "gradientpeak-dev://"],
    callbackPath: "callback",
  };

  it("accepts only an allowlisted scheme at the expected callback path", () => {
    expect(
      isAllowedMobileCallbackUrl(
        "gradientpeak-dev://callback?intent=password-reset&token=token",
        options,
      ),
    ).toBe(true);
    expect(isAllowedMobileCallbackUrl("gradientpeak://sign-in", options)).toBe(false);
  });

  it.each([
    "javascript://callback/%0AglobalThis.compromised=true",
    "data://callback/text/html,pwned",
    "file://callback/etc/passwd",
    "intent://callback#Intent;scheme=gradientpeak;end",
    "unknown://callback",
    "https://callback",
  ])("rejects hostile or unknown mobile target %s", (candidate) => {
    expect(isAllowedMobileCallbackUrl(candidate, options)).toBe(false);
  });

  it("rejects browser-executable schemes even when configuration allowlists them", () => {
    expect(
      isAllowedMobileCallbackUrl("javascript://callback", {
        allowedSchemePrefixes: ["javascript://"],
        callbackPath: "callback",
      }),
    ).toBe(false);
  });

  it.each([
    "gradientpeak:///callback",
    "gradientpeak://user:password@callback",
    "gradientpeak://callback:444",
    "gradientpeak://callback/extra",
    "gradientpeak://callback#unexpected",
  ])("rejects non-canonical callback URL %s", (candidate) => {
    expect(isAllowedMobileCallbackUrl(candidate, options)).toBe(false);
  });
});
