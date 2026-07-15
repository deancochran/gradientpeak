import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthRuntimeEnv } from "./env";
import { createAuthMailer } from "./mailer";

const env = {
  emailMode: "log",
} as AuthRuntimeEnv;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createAuthMailer", () => {
  it("rejects log delivery outside explicit development/test environments", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createAuthMailer(env)).toThrow(
      "Auth log email mode is only available in development or test",
    );
  });

  it("masks recipients in permitted log mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await createAuthMailer(env).send({
      kind: "verification",
      to: "athlete@example.com",
      userEmail: "athlete@example.com",
      actionUrl: "https://app.example.com/auth/confirm?token=local-test-token",
    });

    expect(info).toHaveBeenCalledOnce();
    expect(String(info.mock.calls[0]?.[0])).toContain("at***@example.com");
    expect(String(info.mock.calls[0]?.[0])).not.toContain('"to":"athlete@example.com"');
  });
});
