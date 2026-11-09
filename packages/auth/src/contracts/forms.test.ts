import { describe, expect, it } from "vitest";
import {
  getForgotPasswordFormError,
  isStrongPassword,
  passwordRecoveryAcknowledgement,
} from "./forms";

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

describe("password recovery public boundary", () => {
  it("uses the same neutral acknowledgement for an unknown account", () => {
    expect(getForgotPasswordFormError(new Error("User not found"))).toEqual({
      message: passwordRecoveryAcknowledgement,
      target: "email",
    });
  });
});
