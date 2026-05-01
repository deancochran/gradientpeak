import { beforeEach, describe, expect, it, vi } from "vitest";
import { logMobileAction, sanitizeMobileActionDetails } from "./mobile-action-log";

vi.mock("@/lib/server-config", () => ({
  getServerConfig: () => ({
    apiUrl: "https://api.gradientpeak.app",
    overrideUrl: null,
  }),
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      loading: false,
      ready: true,
      session: {
        user: {
          email: "athlete@example.com",
          id: "user-1",
        },
      },
    }),
  },
}));

describe("mobile action logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_ENABLE_MOBILE_LOGS;
    Object.assign(globalThis, { __DEV__: false });
  });

  it("redacts sensitive details before logging", () => {
    expect(
      sanitizeMobileActionDetails({
        email: "athlete@example.com",
        signedUrl: "https://storage.example.com/file.fit?token=secret",
        status: 200,
      }),
    ).toEqual({
      email: "[redacted]",
      signedUrl: "[redacted]",
      status: 200,
    });
  });

  it("does not emit logs when production logging is not explicitly enabled", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logMobileAction("auth.signIn", "attempt", { email: "athlete@example.com" });

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("omits actor email and redacts detail email when explicitly enabled", () => {
    process.env.EXPO_PUBLIC_ENABLE_MOBILE_LOGS = "1";
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logMobileAction("auth.signIn", "attempt", { email: "athlete@example.com" });

    const logged = String(consoleLog.mock.calls[0]?.[0] ?? "");
    expect(logged).not.toContain("athlete@example.com");
    expect(logged).toContain('"email":"[redacted]"');
    expect(logged).not.toContain("apiUrl");
    expect(logged).not.toContain("serverOverride");
  });
});
