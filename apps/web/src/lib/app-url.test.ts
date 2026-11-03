import { describe, expect, it } from "vitest";
import { getSafeAppRedirectTarget } from "./app-url";

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

  it("rejects cross-origin absolute destinations", () => {
    expect(getSafeAppRedirectTarget("https://attacker.example/path", "/")).toBe("/");
  });
});
