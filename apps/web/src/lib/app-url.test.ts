import { afterEach, describe, expect, it } from "vitest";
import { getSafeAppRedirectTarget } from "./app-url";

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  process.env.APP_URL = originalAppUrl;
});

describe("getSafeAppRedirectTarget", () => {
  it("keeps an internal requested destination", () => {
    expect(getSafeAppRedirectTarget("/calendar?view=week", "/")).toBe("/calendar?view=week");
  });

  it("rejects protocol-relative external destinations", () => {
    expect(getSafeAppRedirectTarget("//attacker.example/path", "/")).toBe("/");
  });

  it.each([
    "/\\attacker.example/path",
    "/%5Cattacker.example/path",
    "/%255Cattacker.example/path",
  ])("rejects literal and encoded backslash redirect targets: %s", (target) => {
    expect(getSafeAppRedirectTarget(target, "/")).toBe("/");
  });

  it.each([
    "/\t/attacker.example/path",
    "/\n/attacker.example/path",
    "/\r/attacker.example/path",
    "/%09/attacker.example/path",
    "/%0a/attacker.example/path",
    "/%0D/attacker.example/path",
    "/%2509/attacker.example/path",
    "/%250a/attacker.example/path",
    "/%250D/attacker.example/path",
  ])("rejects literal and nested-encoded control-character targets: %s", (target) => {
    expect(getSafeAppRedirectTarget(target, "/")).toBe("/");
  });

  it("rejects cross-origin absolute destinations", () => {
    expect(getSafeAppRedirectTarget("https://attacker.example/path", "/")).toBe("/");
  });

  it("uses the configured server application origin for absolute and relative callbacks", () => {
    process.env.APP_URL = "https://app.example";

    expect(getSafeAppRedirectTarget("https://app.example/calendar?view=week#today", "/")).toBe(
      "/calendar?view=week#today",
    );
    expect(getSafeAppRedirectTarget("onboarding?source=callback", "/")).toBe(
      "/onboarding?source=callback",
    );
    expect(getSafeAppRedirectTarget("https://attacker.example/callback", "/")).toBe("/");
  });

  it("fails closed when the configured server application base is malformed", () => {
    process.env.APP_URL = "not a URL";

    expect(getSafeAppRedirectTarget("/calendar", "/")).toBe("/");
  });
});
