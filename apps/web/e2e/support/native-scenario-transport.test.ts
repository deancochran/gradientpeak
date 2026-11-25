import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDisposableAcceptanceLease } from "./disposable-acceptance-lease";
import {
  type NativeScenarioTransport,
  startNativeScenarioTransport,
} from "./native-scenario-transport";

const directories: string[] = [];
const servers: Server[] = [];
const transports: NativeScenarioTransport[] = [];

function environment() {
  const artifacts = mkdtempSync(join(tmpdir(), "gradientpeak-native-transport-"));
  directories.push(artifacts);
  const connectionString =
    "postgresql://tester:test@127.0.0.1:54322/gradientpeak_web_acceptance_123_456";
  const lease = createDisposableAcceptanceLease({
    artifacts,
    connectionString,
    runId: `native-transport-${process.pid}`,
  });
  return {
    ...process.env,
    ...lease,
    DATABASE_URL: connectionString,
    POSTGRES_URL: connectionString,
    E2E_ACCEPTANCE_ARTIFACTS: artifacts,
    E2E_ACCEPTANCE_NATIVE: "1",
    E2E_DISPOSABLE_DATABASE: "1",
    E2E_RUN_ID: `native-transport-${process.pid}`,
    NODE_ENV: "test",
  };
}

async function upstream(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing upstream test port");
  return address.port;
}

function applyBody(sessionId: string, operationId = "a".repeat(32)) {
  return JSON.stringify({
    0: { json: { operationId, preview: { sessionId }, expectedPreviewFingerprint: "v1:sha256:x" } },
  });
}

async function start(sessionId: string, env = environment(), port?: number) {
  const transport = await startNativeScenarioTransport({
    environment: env,
    sessionId,
    ...(port ? { upstreamPort: port } : {}),
  });
  transports.push(transport);
  return transport;
}

async function post(origin: string, path: string, body: string) {
  return fetch(`${origin}${path}`, {
    body,
    headers: { authorization: "Bearer synthetic", "content-type": "application/json" },
    method: "POST",
  });
}

afterEach(async () => {
  await Promise.all(transports.splice(0).map((transport) => transport.stop()));
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
  for (const directory of directories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe("native scenario transport", () => {
  it("drops only the first ACK after a successful matching upstream apply and forwards the exact retry", async () => {
    const received: string[] = [];
    const port = await upstream(async (request, response) => {
      received.push(
        await new Promise<string>((done) => {
          let body = "";
          request.on("data", (chunk) => (body += chunk));
          request.on("end", () => done(body));
        }),
      );
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ result: { data: { applied: true } } }]));
    });
    const transport = await start("session_1", environment(), port);
    const body = applyBody("session_1");

    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", body),
    ).rejects.toThrow();
    const retry = await post(
      transport.origin,
      "/api/trpc/plannedSessions.applyScenario?batch=1",
      body,
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual([{ result: { data: { applied: true } } }]);
    expect(received).toEqual([body, body]);
    expect(JSON.parse(readFileSync(transport.observationPath, "utf8"))).toEqual({
      dropped: true,
      requests: [
        { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: "a".repeat(32) },
        { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: "a".repeat(32) },
      ],
    });
  });

  it("does not inject a success for unrelated, mismatched, or failed upstream responses", async () => {
    const port = await upstream((request, response) => {
      if (request.url?.startsWith("/api/trpc/plannedSessions.applyScenario")) {
        response.statusCode = 500;
        response.end(JSON.stringify([{ error: { message: "no" } }]));
      } else response.end(JSON.stringify([{ error: { message: "not-applied" } }]));
    });
    const transport = await start("session_1", environment(), port);
    await expect(post(transport.origin, "/other", "{}")).resolves.toMatchObject({ status: 200 });
    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", applyBody("other")),
    ).resolves.toMatchObject({ status: 500 });
    await expect(
      post(
        transport.origin,
        "/api/trpc/plannedSessions.applyScenario?batch=1",
        applyBody("session_1"),
      ),
    ).resolves.toMatchObject({ status: 500 });
    expect(JSON.parse(readFileSync(transport.observationPath, "utf8"))).toEqual({
      dropped: false,
      requests: [
        { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: "a".repeat(32) },
      ],
    });
  });

  it("rejects invalid startup input, revokes forwarding after lease loss, and cleans up", async () => {
    const port = await upstream((_request, response) => response.end("ok"));
    const env = environment();
    await expect(
      startNativeScenarioTransport({
        environment: { ...env, E2E_ACCEPTANCE_NATIVE: "0" },
        sessionId: "session_1",
      }),
    ).rejects.toThrow(/native acceptance runner/);
    await expect(
      startNativeScenarioTransport({ environment: env, sessionId: "../bad" }),
    ).rejects.toThrow(/session identity/);
    const transport = await start("session_1", env, port);
    unlinkSync(env.E2E_DISPOSABLE_LEASE_PATH ?? "");
    await expect(post(transport.origin, "/other", "{}")).resolves.toMatchObject({ status: 503 });
    await transport.stop();
    await expect(fetch(transport.origin)).rejects.toThrow();
  });

  it("refuses malformed lease state and oversized request bodies before forwarding", async () => {
    const port = await upstream((_request, response) => response.end("unexpected"));
    const env = environment();
    writeFileSync(env.E2E_DISPOSABLE_LEASE_PATH ?? "", "not-json");
    await expect(
      startNativeScenarioTransport({
        environment: env,
        sessionId: "session_1",
        upstreamPort: port,
      }),
    ).rejects.toThrow(/Disposable/);
    const valid = environment();
    const transport = await start("session_1", valid, port);
    await expect(
      post(transport.origin, "/other", "x".repeat(64 * 1024 + 1)),
    ).resolves.toMatchObject({
      status: 413,
    });
    const responsePort = await upstream((_request, response) =>
      response.end("x".repeat(1024 * 1024 + 1)),
    );
    const responseTransport = await start("session_1", valid, responsePort);
    await expect(post(responseTransport.origin, "/other", "{}")).resolves.toMatchObject({
      status: 502,
    });
  });
});
