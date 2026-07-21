import { afterEach, describe, expect, it } from "vitest";

import { handleAuthOpenRequest } from "./open";

const originalAppScheme = process.env.APP_SCHEME;

afterEach(() => {
  process.env.APP_SCHEME = originalAppScheme;
});

describe("auth open route", () => {
  it("renders the trampoline for an allowlisted non-sensitive callback deep link", async () => {
    process.env.APP_SCHEME = "gradientpeak-dev";
    const next = encodeURIComponent("gradientpeak-dev://callback?intent=post-sign-in");

    const response = handleAuthOpenRequest(
      new Request(`https://app.example/auth/open?next=${next}&fallback=/auth/login`),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("gradientpeak-dev://callback");
  });

  it("rejects token-bearing callbacks so credentials are not nested in a second HTTP URL", () => {
    process.env.APP_SCHEME = "gradientpeak-dev";
    const next = encodeURIComponent(
      "gradientpeak-dev://callback?intent=password-reset&token=reset-token",
    );

    const response = handleAuthOpenRequest(
      new Request(`https://app.example/auth/open?next=${next}&fallback=/auth/login`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/auth/login");
  });

  it.each([
    "javascript://callback/%0AglobalThis.compromised=true",
    "data://callback/text/html,pwned",
    "unknown://callback",
    "gradientpeak-dev://sign-in",
  ])("redirects hostile or unexpected deep link %s to login", (candidate) => {
    process.env.APP_SCHEME = "gradientpeak-dev";
    const next = encodeURIComponent(candidate);

    const response = handleAuthOpenRequest(
      new Request(`https://app.example/auth/open?next=${next}&fallback=/auth/login`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example/auth/login");
  });

  it("escapes deep-link query values before embedding them in inline script", async () => {
    process.env.APP_SCHEME = "gradientpeak-dev";
    const injection = "</script><script>globalThis.compromised=true</script>";
    const next = encodeURIComponent(
      `gradientpeak-dev://callback?intent=post-sign-in&query=${injection}`,
    );

    const response = handleAuthOpenRequest(
      new Request(`https://app.example/auth/open?next=${next}&fallback=/auth/login`),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain(`query=${injection}`);
    expect(html).toContain("query=\\u003c/script\\u003e");
  });

  it("escapes same-origin fallback values before embedding them in inline script", async () => {
    process.env.APP_SCHEME = "gradientpeak-dev";
    const injection = "</script><script>globalThis.compromised=true</script>";
    const next = encodeURIComponent("gradientpeak-dev://callback?intent=post-sign-in");
    const fallback = encodeURIComponent(`/auth/login?message=${injection}`);

    const response = handleAuthOpenRequest(
      new Request(`https://app.example/auth/open?next=${next}&fallback=${fallback}`),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain(`message=${injection}`);
    expect(html).toContain("message=%3C/script%3E");
  });
});
