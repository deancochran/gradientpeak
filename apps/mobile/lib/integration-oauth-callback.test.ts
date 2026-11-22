import { describe, expect, it } from "vitest";

import { parseIntegrationOAuthCallback } from "./integration-oauth-callback";

describe("parseIntegrationOAuthCallback", () => {
  it("returns an actionable Wahoo token-limit recovery message", () => {
    expect(
      parseIntegrationOAuthCallback(
        "gradientpeak-dev://integrations?integration=failed&provider=wahoo&error=wahoo_token_limit_exceeded",
      ),
    ).toEqual({
      description:
        "Wahoo has too many active GradientPeak authorizations. Revoke GradientPeak in your Wahoo account, then try again.",
      status: "failed",
      title: "Issue",
    });
  });

  it("does not expose provider-controlled error details", () => {
    const outcome = parseIntegrationOAuthCallback(
      "gradientpeak-dev://integrations?error=token_exchange_failed&error_detail=secret-provider-value",
    );

    expect(outcome?.description).toBe(
      "The provider rejected the connection. Check its app access and try again.",
    );
    expect(outcome?.description).not.toContain("secret-provider-value");
  });

  it("recognizes a connected callback", () => {
    expect(
      parseIntegrationOAuthCallback(
        "gradientpeak-dev://integrations?integration=connected&provider=wahoo&success=true",
      ),
    ).toMatchObject({ status: "connected" });
  });
});
