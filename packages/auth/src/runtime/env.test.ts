import { describe, expect, it } from "vitest";

import { parseAuthTrustedOrigins, resolveDevelopmentAuthTrustedOrigins } from "./env";

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
