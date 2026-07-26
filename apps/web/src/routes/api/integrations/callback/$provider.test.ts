import { afterEach, describe, expect, it, vi } from "vitest";

const { getDefaultMobileOAuthRedirect, handleOAuthCallback } = vi.hoisted(() => ({
  getDefaultMobileOAuthRedirect: vi.fn(),
  handleOAuthCallback: vi.fn(),
}));

vi.mock("@repo/api/server", () => ({ getDefaultMobileOAuthRedirect, handleOAuthCallback }));
vi.mock("@repo/db/client", () => ({ db: { kind: "test-db" } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn(() => (options: unknown) => options),
}));

import { handleOAuthCallbackRequest } from "./$provider";

describe("OAuth callback HTTP boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not use the request origin as the production fallback redirect", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROVIDER_OAUTH_TEST_ADAPTER", "1");
    vi.stubEnv("OAUTH_MOBILE_CALLBACK_URL", "https://app.example.com/integrations");
    getDefaultMobileOAuthRedirect.mockReturnValue("https://app.example.com/integrations");
    handleOAuthCallback.mockResolvedValue({
      redirectUrl: "https://app.example.com/integrations?error=invalid_state",
      status: 302,
    });

    const response = await handleOAuthCallbackRequest({
      params: { provider: "wahoo" },
      request: new Request(
        "https://attacker.example/api/integrations/callback/wahoo?state=bad&test_return=web",
      ),
    });

    expect(response.status).toBe(302);
    expect(handleOAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackRedirect: "https://app.example.com/integrations",
        provider: "wahoo",
        state: "bad",
      }),
    );
  });

  it("does not reflect a hostile non-production origin through the local test fallback", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PROVIDER_OAUTH_TEST_ADAPTER", "1");
    vi.stubEnv("OAUTH_MOBILE_CALLBACK_URL", "https://app.example.com/integrations");
    getDefaultMobileOAuthRedirect.mockReturnValue("https://app.example.com/integrations");
    handleOAuthCallback.mockResolvedValue({
      redirectUrl: "https://app.example.com/integrations?error=invalid_state",
      status: 302,
    });

    await handleOAuthCallbackRequest({
      params: { provider: "wahoo" },
      request: new Request(
        "https://attacker.example/api/integrations/callback/wahoo?state=bad&test_return=web",
      ),
    });

    expect(handleOAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackRedirect: "https://app.example.com/integrations" }),
    );
  });

  it("uses the installed development scheme when no callback is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OAUTH_MOBILE_CALLBACK_URL", "");
    getDefaultMobileOAuthRedirect.mockReturnValue("gradientpeak-dev://integrations");
    handleOAuthCallback.mockResolvedValue({
      redirectUrl: "gradientpeak-dev://integrations?error=invalid_state",
      status: 302,
    });

    await handleOAuthCallbackRequest({
      params: { provider: "wahoo" },
      request: new Request("http://localhost:3000/api/integrations/callback/wahoo?state=bad"),
    });

    expect(handleOAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackRedirect: "gradientpeak-dev://integrations" }),
    );
    expect(getDefaultMobileOAuthRedirect).toHaveBeenCalledOnce();
  });

  it("allows the explicit loopback origin for the local OAuth test adapter", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PROVIDER_OAUTH_TEST_ADAPTER", "1");
    handleOAuthCallback.mockResolvedValue({
      redirectUrl: "http://127.0.0.1:3000/integrations?error=invalid_state",
      status: 302,
    });

    await handleOAuthCallbackRequest({
      params: { provider: "wahoo" },
      request: new Request(
        "http://127.0.0.1:3000/api/integrations/callback/wahoo?state=bad&test_return=web",
      ),
    });

    expect(handleOAuthCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackRedirect: "http://127.0.0.1:3000/integrations?integration=failed",
      }),
    );
  });
});
