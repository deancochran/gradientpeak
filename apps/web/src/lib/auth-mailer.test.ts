import { describe, expect, it, vi } from "vitest";

import { createAuthMailer } from "../../../../packages/auth/src/runtime/mailer";

describe("createAuthMailer", () => {
  it("logs the action URL in log mode for local fallback flows", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const mailer = createAuthMailer({
      appUrl: "http://localhost:3000",
      mobileScheme: "gradientpeak",
      loginPath: "/auth/login",
      webCallbackPath: "/auth/confirm",
      mobileCallbackPath: "callback",
      emailMode: "log",
    });

    await mailer.send({
      kind: "verification",
      to: "athlete@example.com",
      actionUrl: "gradientpeak-dev://callback?intent=email-verification&token=test-token",
      userEmail: "athlete@example.com",
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "gradientpeak-dev://callback?intent=email-verification&token=test-token",
      ),
    );

    consoleInfoSpy.mockRestore();
  });
});
