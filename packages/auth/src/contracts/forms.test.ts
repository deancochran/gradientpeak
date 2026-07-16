import { describe, expect, it } from "vitest";
import { isStrongPassword } from "./forms";

describe("isStrongPassword", () => {
  it.each([
    ["Password1", true],
    ["password1", false],
    ["PASSWORD", false],
    ["Pass1", false],
  ])("returns %s for %s", (password, expected) => {
    expect(isStrongPassword(password)).toBe(expected);
  });
});
