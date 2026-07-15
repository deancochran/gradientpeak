import { afterEach, describe, expect, it, vi } from "vitest";

import { logServerEvent } from "./server-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logServerEvent", () => {
  it("redacts auth secrets in query parameters and nested callback URLs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const callback = "gradientpeak://callback?intent=password-reset&token=deep-link-token";
    const request = new Request(
      `https://app.example/api/auth/callback?code=oauth-code&state=oauth-state&next=${encodeURIComponent(callback)}&intent=password-reset`,
      {
        headers: {
          referer: "https://app.example/auth/confirm?token_hash=email-token&type=signup",
        },
      },
    );

    logServerEvent("auth.route.request", {}, { request });

    const line = String(info.mock.calls[0]?.[0]);
    expect(line).not.toContain("oauth-code");
    expect(line).not.toContain("oauth-state");
    expect(line).not.toContain("deep-link-token");
    expect(line).not.toContain("email-token");
    expect(line).toContain("intent=password-reset");
    expect(line).toContain(encodeURIComponent("[REDACTED]"));
  });
});
