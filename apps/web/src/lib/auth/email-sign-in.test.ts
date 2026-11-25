import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setResponseHeader: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: mocks.setResponseHeader,
}));

import { signInWithEmailAndForwardSession } from "./email-sign-in";

beforeEach(() => {
  mocks.setResponseHeader.mockReset();
});

describe("signInWithEmailAndForwardSession", () => {
  it("forwards Better Auth response headers so the browser receives its session cookie", async () => {
    const headers = new Headers({ "set-cookie": "gradientpeak.session=test; Path=/; HttpOnly" });
    const signInEmail = vi.fn(async () => ({ headers }));

    await signInWithEmailAndForwardSession(
      { signInEmail },
      { email: "athlete@example.com", password: "Password1" },
    );

    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: "athlete@example.com", password: "Password1" },
      returnHeaders: true,
    });
    expect(mocks.setResponseHeader).toHaveBeenCalledWith("set-cookie", [
      "gradientpeak.session=test; Path=/; HttpOnly",
    ]);
  });

  it("does not write response headers when sign-in fails", async () => {
    const signInEmail = vi.fn(async () => {
      throw new Error("Invalid credentials");
    });

    await expect(
      signInWithEmailAndForwardSession(
        { signInEmail },
        { email: "athlete@example.com", password: "wrong" },
      ),
    ).rejects.toThrow("Invalid credentials");
    expect(mocks.setResponseHeader).not.toHaveBeenCalled();
  });

  it("preserves multiple session cookies as separate response headers", async () => {
    const headers = new Headers();
    Object.defineProperty(headers, "getSetCookie", {
      value: () => [
        "gradientpeak.session=one; Path=/; HttpOnly",
        "gradientpeak.session_data=two; Path=/; HttpOnly",
      ],
    });

    await signInWithEmailAndForwardSession(
      { signInEmail: vi.fn(async () => ({ headers })) },
      { email: "athlete@example.com", password: "Password1" },
    );

    expect(mocks.setResponseHeader).toHaveBeenCalledWith("set-cookie", [
      "gradientpeak.session=one; Path=/; HttpOnly",
      "gradientpeak.session_data=two; Path=/; HttpOnly",
    ]);
  });
});
