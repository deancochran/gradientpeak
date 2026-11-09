import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
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
  it("sends SMTP messages to an in-process test server", async () => {
    const messages: string[] = [];
    const server = createServer((socket) => {
      let buffer = "";
      let message = "";
      let receivingMessage = false;

      socket.setEncoding("utf8");
      socket.write("220 localhost ESMTP\r\n");
      socket.on("data", (chunk) => {
        buffer += chunk;
        let lineEnd = buffer.indexOf("\r\n");
        while (lineEnd >= 0) {
          const line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 2);

          if (receivingMessage) {
            if (line === ".") {
              messages.push(message);
              message = "";
              receivingMessage = false;
              socket.write("250 message accepted\r\n");
            } else {
              message += `${line}\r\n`;
            }
          } else if (/^EHLO /i.test(line)) {
            socket.write("250-localhost\r\n250 OK\r\n");
          } else if (/^(MAIL FROM|RCPT TO):/i.test(line)) {
            socket.write("250 OK\r\n");
          } else if (line === "DATA") {
            receivingMessage = true;
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          } else if (line === "QUIT") {
            socket.end("221 Bye\r\n");
          }

          lineEnd = buffer.indexOf("\r\n");
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const port = (server.address() as { port: number }).port;
      await createAuthMailer({
        emailMode: "smtp",
        emailFrom: "auth@local.test",
        smtpHost: "127.0.0.1",
        smtpPort: port,
        smtpSecure: false,
      } as AuthRuntimeEnv).send({
        kind: "verification",
        to: "recipient@local.test",
        userEmail: "recipient@local.test",
        actionUrl: "http://localhost/auth/verify-email?token=single-use-token",
      });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("To: recipient@local.test");
      expect(messages[0]).toContain("Subject: Verify your GradientPeak email");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

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
