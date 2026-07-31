import { afterEach, describe, expect, it } from "vitest";

import { handleAuthConfirmRequest } from "./confirm";

const originalAppUrl = process.env.APP_URL;
const originalAllowedDeepLinkPrefixes = process.env.AUTH_ALLOWED_DEEP_LINK_PREFIXES;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.APP_URL = originalAppUrl;
  process.env.AUTH_ALLOWED_DEEP_LINK_PREFIXES = originalAllowedDeepLinkPrefixes;
  process.env.NODE_ENV = originalNodeEnv;
});

async function confirm(query = "") {
  return handleAuthConfirmRequest(new Request(`https://request.example/auth/confirm${query}`));
}

describe("auth confirm route", () => {
  it("redirects Better Auth web callbacks to a same-origin next path", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm(
      "?target=web&intent=email-verification&next=/dashboard&fallback=/auth/login",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/dashboard");
  });

  it("redirects Better Auth mobile callbacks through the deep-link trampoline", async () => {
    process.env.APP_URL = "https://app.example";
    process.env.AUTH_ALLOWED_DEEP_LINK_PREFIXES = "gradientpeak-dev://";

    const response = await confirm(
      "?target=mobile&intent=password-reset&token=reset-token&code=authorization-code&fallback=/auth/login",
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(html).toContain("gradientpeak-dev://callback?intent=password-reset");
    expect(html).toContain("token=reset-token");
    expect(html).toContain("code=authorization-code");
    expect(html).toContain("https://app.example/auth/login");
  });

  it("handles a provider error without exposing an accompanying token", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm(
      "?target=web&intent=post-sign-in&fallback=/auth/login&error=provider-denied&token=secret-token",
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/auth/error");
    expect(location.searchParams.get("error")).toBe("provider-denied");
    expect(location.search).not.toContain("secret-token");
  });

  it("falls back to login when a web callback supplies an external fallback", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm(
      "?target=web&intent=email-verification&fallback=https://attacker.example/collect",
    );

    expect(response.headers.get("location")).toBe("https://app.example/auth/login");
  });

  it("rejects protocol-relative web callback destinations", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm(
      "?target=web&intent=email-verification&next=//attacker.example/collect&fallback=/auth/login",
    );

    expect(response.headers.get("location")).toBe("https://app.example/auth/login");
  });

  it("fails closed to the same-origin fallback when production has no mobile allowlist", async () => {
    process.env.APP_URL = "https://app.example";
    process.env.NODE_ENV = "production";

    const response = await confirm("?target=mobile&intent=email-verification&fallback=/auth/login");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/auth/login");
  });

  it("fails closed when the obsolete callback shape omits target", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm("?intent=post-sign-in&fallback=/auth/login&token=secret-token");
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/auth/error");
    expect(location.searchParams.get("error")).toBe("Invalid auth callback parameters");
    expect(location.search).not.toContain("secret-token");
  });

  it("fails closed when the obsolete callback shape omits fallback", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm("?target=mobile&intent=post-sign-in&token=secret-token");
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/auth/error");
    expect(location.searchParams.get("error")).toBe("Invalid auth callback parameters");
    expect(location.search).not.toContain("secret-token");
  });

  it("fails closed for an invalid callback intent", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm(
      "?target=mobile&intent=javascript&fallback=/auth/login&token=secret-token",
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/auth/error");
    expect(location.searchParams.get("error")).toBe("Invalid auth callback parameters");
    expect(location.search).not.toContain("secret-token");
  });
});
