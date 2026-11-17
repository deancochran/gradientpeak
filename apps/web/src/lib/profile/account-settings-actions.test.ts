import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  changePassword: vi.fn(),
  revokeOtherSessions: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@repo/auth/server", () => ({ getGradientPeakAuth: () => ({ api: auth }) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ "x-test-session": "fixture" }),
}));
vi.mock("@tanstack/react-router", () => ({ redirect: (options: object) => options }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (data: unknown) => data;
    const builder = {
      validator: (validator: typeof parse) => {
        parse = validator;
        return builder;
      },
      handler: (handler: (context: { data: unknown }) => unknown) => (args?: { data?: unknown }) =>
        Promise.resolve().then(() => handler({ data: parse(args?.data) })),
    };
    return builder;
  },
}));
vi.mock("../app-url", () => ({
  toAbsoluteAppUrl: (path: string) => `https://example.test${path}`,
  getSafeAppRedirectTarget: () => "/",
}));
vi.mock("../auth/email-sign-in", () => ({ signInWithEmailAndForwardSession: vi.fn() }));

import { CONTRACT_EPOCH_HEADER } from "@repo/api/client";
import { sendVerificationEmailAction } from "../auth/server-actions";
import {
  changePasswordAction,
  resendVerificationFromSettingsAction,
  revokeOtherSessionsAction,
} from "./account-settings";

function data(values: Record<string, string>, enhanced = true) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  result.set(CONTRACT_EPOCH_HEADER, "test");
  if (enhanced) result.set("__async", "true");
  return result;
}
const password = {
  currentPassword: "OldPass123!",
  newPassword: "NewPass456!",
  confirmPassword: "NewPass456!",
};
beforeEach(() => {
  for (const action of Object.values(auth)) action.mockReset().mockResolvedValue(undefined);
});
describe("sensitive action transport contracts (mock auth only)", () => {
  it("returns typed password failure and success while preserving session revocation policy", async () => {
    auth.changePassword.mockRejectedValueOnce(new Error("private auth detail"));
    await expect(changePasswordAction({ data: data(password) })).resolves.toEqual({
      ok: false,
      message: "Password could not be updated. Check your current password and try again.",
    });
    await expect(changePasswordAction({ data: data(password) })).resolves.toEqual({ ok: true });
    expect(auth.changePassword).toHaveBeenLastCalledWith({
      body: {
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
        revokeOtherSessions: true,
      },
      headers: expect.any(Headers),
    });
  });
  it("retains password POST redirects and rejects invalid credentials before auth", async () => {
    await expect(changePasswordAction({ data: data(password, false) })).rejects.toMatchObject({
      statusCode: 303,
      href: expect.stringContaining("flashType=success"),
    });
    auth.changePassword.mockRejectedValueOnce(new Error("Unable to update"));
    await expect(changePasswordAction({ data: data(password, false) })).rejects.toMatchObject({
      statusCode: 303,
      href: expect.stringContaining("flashType=error"),
    });
    await expect(
      changePasswordAction({ data: data({ ...password, confirmPassword: "wrong" }) }),
    ).rejects.toThrow();
    expect(auth.changePassword).toHaveBeenCalledTimes(2);
  });
  it("keeps revocation authenticated and separates typed failure from confirmed success", async () => {
    auth.revokeOtherSessions.mockRejectedValueOnce(new Error("private auth detail"));
    await expect(revokeOtherSessionsAction({ data: data({}) })).resolves.toMatchObject({
      ok: false,
    });
    await expect(revokeOtherSessionsAction({ data: data({}) })).resolves.toEqual({ ok: true });
    expect(auth.revokeOtherSessions).toHaveBeenLastCalledWith({ headers: expect.any(Headers) });
    await expect(revokeOtherSessionsAction({ data: data({}, false) })).rejects.toMatchObject({
      statusCode: 303,
      href: expect.stringContaining("flashType=success"),
    });
  });
  it.each([
    resendVerificationFromSettingsAction,
    sendVerificationEmailAction,
  ])("keeps verification acknowledgements identical for success and delivery rejection", async (action) => {
    const input = data({ email: "fixture@example.test" });
    const success = await action({ data: input });
    auth.sendVerificationEmail.mockRejectedValueOnce(new Error("Account not found"));
    expect(await action({ data: input })).toEqual(success);
    expect(success).toEqual({ ok: true });
    auth.sendVerificationEmail.mockRejectedValueOnce(new Error("Delivery unavailable"));
    await expect(
      action({ data: data({ email: "fixture@example.test" }, false) }),
    ).rejects.toMatchObject({
      statusCode: 303,
      href: expect.stringContaining("flashType=success"),
    });
  });
});
