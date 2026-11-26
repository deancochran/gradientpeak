import { describe, expect, it } from "vitest";
import { changePasswordFormSchema } from "./form-schemas";

describe("profile account settings", () => {
  it("enforces the shared strong-password policy and confirmation", () => {
    expect(
      changePasswordFormSchema.safeParse({
        currentPassword: "OldPass123!",
        newPassword: "NewPass456!",
        confirmPassword: "NewPass456!",
      }).success,
    ).toBe(true);
    expect(
      changePasswordFormSchema.safeParse({
        currentPassword: "OldPass123!",
        newPassword: "weakpass",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
  });

  it("rejects reusing the current password", () => {
    const password = "SamePass123!";
    expect(
      changePasswordFormSchema.safeParse({
        currentPassword: password,
        newPassword: password,
        confirmPassword: password,
      }).success,
    ).toBe(false);
  });
});
