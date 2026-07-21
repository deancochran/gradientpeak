import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("captures complete action URLs only in test mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const directory = await mkdtemp(join(tmpdir(), "gradientpeak-auth-mail-"));
    const capturePath = join(directory, "mail.jsonl");
    const mailer = createAuthMailer({
      ...env,
      emailMode: "capture",
      emailCapturePath: capturePath,
    });

    await mailer.send({
      kind: "verification",
      to: "new-athlete@example.com",
      actionUrl: "http://localhost/auth/verify-email?token=single-use-token",
      userEmail: "new-athlete@example.com",
    });

    expect(JSON.parse((await readFile(capturePath, "utf8")).trim())).toMatchObject({
      kind: "verification",
      to: "new-athlete@example.com",
      actionUrl: "http://localhost/auth/verify-email?token=single-use-token",
    });
  });

  it("rejects capture mode outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      createAuthMailer({
        ...env,
        emailMode: "capture",
        emailCapturePath: "/tmp/mail.jsonl",
      }),
    ).toThrow("Auth capture email mode is only available in tests");
  });
});
