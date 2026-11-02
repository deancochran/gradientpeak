import { describe, expect, it } from "vitest";
import { getSafeAppRedirectTarget } from "./app-url";

describe("getSafeAppRedirectTarget", () => {
  it("keeps an internal requested destination", () => {
    expect(getSafeAppRedirectTarget("/calendar?view=week", "/")).toBe("/calendar?view=week");
  });

  it("rejects protocol-relative external destinations", () => {
    expect(getSafeAppRedirectTarget("//attacker.example/path", "/")).toBe("/");
  });
});
