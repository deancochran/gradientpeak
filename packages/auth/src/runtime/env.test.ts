import { describe, expect, it } from "vitest";

import {
  parseAuthTrustedOrigins,
  resolveAuthBootstrapEnv,
  resolveDevelopmentAuthTrustedOrigins,
} from "./env";

describe("resolveAuthBootstrapEnv", () => {
  it.each(["development", "test"])("keeps local defaults in %s", (nodeEnv) => {
    expect(resolveAuthBootstrapEnv({ nodeEnv })).toEqual({
      appUrl: "http://localhost:3000",
      mobileScheme: "gradientpeak",
    });
  });

  it("requires an explicit APP_URL before production auth can initialize", () => {
    expect(() =>
      resolveAuthBootstrapEnv({ nodeEnv: "production", mobileScheme: "gradientpeak" }),
    ).toThrow("APP_URL is required");
  });

  it("requires an explicit mobile scheme before production auth can initialize", () => {
    expect(() =>
      resolveAuthBootstrapEnv({ nodeEnv: "production", appUrl: "https://app.example.com" }),
    ).toThrow("AUTH_MOBILE_SCHEME is required");
  });

  it("rejects HTTP and non-origin production APP_URL values", () => {
    expect(() =>
      resolveAuthBootstrapEnv({
        nodeEnv: "production",
        appUrl: "http://app.example.com",
        mobileScheme: "gradientpeak",
      }),
    ).toThrow("APP_URL must use HTTPS");
    expect(() =>
      resolveAuthBootstrapEnv({
        nodeEnv: "production",
        appUrl: "https://app.example.com/auth",
        mobileScheme: "gradientpeak",
      }),
    ).toThrow();
  });

  it("rejects broad or browser-executable production mobile schemes", () => {
    expect(() =>
      resolveAuthBootstrapEnv({
        nodeEnv: "production",
        appUrl: "https://app.example.com",
        mobileScheme: "https",
      }),
    ).toThrow("Mobile scheme must not be browser-executable or reserved");
    expect(() =>
      resolveAuthBootstrapEnv({
        nodeEnv: "production",
        appUrl: "https://app.example.com",
        mobileScheme: "gradientpeak://callback",
      }),
    ).toThrow("Mobile scheme must be a bare custom URL scheme");
  });

  it("accepts and normalizes explicit production origins and schemes", () => {
    expect(
      resolveAuthBootstrapEnv({
        nodeEnv: "production",
        appUrl: "https://app.example.com/",
        mobileScheme: "gradientpeak",
      }),
    ).toEqual({ appUrl: "https://app.example.com", mobileScheme: "gradientpeak" });
  });
});

describe("parseAuthTrustedOrigins", () => {
  it("accepts comma-separated exact origins and removes duplicates", () => {
    expect(
      parseAuthTrustedOrigins(
        "http://100.119.109.24:3000, https://dev.gradientpeak.com/, http://100.119.109.24:3000",
      ),
    ).toEqual(["http://100.119.109.24:3000", "https://dev.gradientpeak.com"]);
  });

  it("rejects origins containing paths or credentials", () => {
    expect(() => parseAuthTrustedOrigins("https://example.com/path")).toThrow();
    expect(() => parseAuthTrustedOrigins("https://user@example.com")).toThrow();
  });

  it("rejects wildcard, non-HTTP, query, and fragment origins", () => {
    expect(() => parseAuthTrustedOrigins("https://*.example.com")).toThrow();
    expect(() => parseAuthTrustedOrigins("ftp://example.com")).toThrow();
    expect(() => parseAuthTrustedOrigins("https://example.com?tenant=one")).toThrow();
    expect(() => parseAuthTrustedOrigins("https://example.com#fragment")).toThrow();
  });
});

describe("resolveDevelopmentAuthTrustedOrigins", () => {
  it("includes exact configured and default origins only in development", () => {
    expect(
      resolveDevelopmentAuthTrustedOrigins("development", "https://dev.gradientpeak.com", [
        "http://100.119.109.24:3000",
      ]),
    ).toEqual(["https://dev.gradientpeak.com", "http://100.119.109.24:3000"]);
    expect(
      resolveDevelopmentAuthTrustedOrigins("production", "https://dev.gradientpeak.com", [
        "http://100.119.109.24:3000",
      ]),
    ).toEqual([]);
  });
});
