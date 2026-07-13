import { afterEach, describe, expect, it } from "vitest";

import { handleAuthConfirmRequest } from "./confirm";

const originalAppUrl = process.env.APP_URL;
const originalAppScheme = process.env.APP_SCHEME;

afterEach(() => {
  process.env.APP_URL = originalAppUrl;
  process.env.APP_SCHEME = originalAppScheme;
});

async function confirm(query = "") {
  return handleAuthConfirmRequest(new Request(`https://request.example/auth/confirm${query}`));
}

describe("auth confirm route", () => {
  it("redirects Better Auth web callbacks to a same-origin next path", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm("?target=web&intent=email-verification&next=/dashboard");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/dashboard");
  });

  it("redirects Better Auth mobile callbacks through the deep-link trampoline", async () => {
    process.env.APP_URL = "https://app.example";
    process.env.APP_SCHEME = "gradientpeak-dev";

    const response = await confirm(
      "?target=mobile&intent=password-reset&token=reset-token&fallback=/auth/login",
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://app.example");
    expect(location.pathname).toBe("/auth/open");
    expect(location.searchParams.get("next")).toBe(
      "gradientpeak-dev://callback?intent=password-reset&token=reset-token",
    );
    expect(location.searchParams.get("fallback")).toBe("https://app.example/auth/login");
  });

  it("falls back to login when a web callback supplies an external fallback", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm(
      "?target=web&intent=email-verification&fallback=https://attacker.example/collect",
    );

    expect(response.headers.get("location")).toBe("https://app.example/auth/login");
  });

  it("reports missing callback parameters", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm();
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/auth/error");
    expect(location.searchParams.get("error")).toBe("Missing auth callback parameters");
  });

  it("rejects retired Supabase OTP parameters with migration guidance", async () => {
    process.env.APP_URL = "https://app.example";

    const response = await confirm("?token_hash=old-token&type=signup");
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/auth/error");
    expect(location.searchParams.get("error")).toContain("retired Supabase OTP flow");
  });
});
