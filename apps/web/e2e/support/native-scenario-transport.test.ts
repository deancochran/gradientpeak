import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDisposableAcceptanceLease } from "./disposable-acceptance-lease";
import {
  type NativeScenarioTransport,
  startNativeScenarioTransport,
  stopNativeScenarioTransportChild,
} from "./native-scenario-transport";

const directories: string[] = [];
const servers: Server[] = [];
const transports: NativeScenarioTransport[] = [];
const sessionId = "11111111-1111-4111-8111-111111111111";

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

function appliedResponse(returnedSessionId = sessionId) {
  return [
    { result: { data: { json: { session: { id: returnedSessionId }, status: "applied" } } } },
  ];
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

async function directChildExit(
  environment: NodeJS.ProcessEnv,
  observationPath: string,
  port: number,
) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve(import.meta.dirname, "native-scenario-transport-child.ts"),
      sessionId,
      observationPath,
      String(port),
    ],
    { env: environment, stdio: "ignore" },
  );
  const [code] = await once(child, "exit");
  return code;
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
      response.end(JSON.stringify(appliedResponse()));
    });
    const transport = await start(sessionId, environment(), port);
    const body = applyBody(sessionId);

    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", body),
    ).rejects.toThrow();
    const retry = await post(
      transport.origin,
      "/api/trpc/plannedSessions.applyScenario?batch=1",
      body,
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(appliedResponse());
    expect(received).toEqual([body, body]);
    expect(JSON.parse(readFileSync(transport.observationPath, "utf8"))).toEqual({
      dropped: true,
      requests: [
        { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: "a".repeat(32) },
        { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: "a".repeat(32) },
      ],
    });
    const [first, second] = JSON.parse(readFileSync(transport.observationPath, "utf8")).requests;
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("does not inject a success for unrelated, mismatched, or failed upstream responses", async () => {
    const port = await upstream((request, response) => {
      if (request.url?.startsWith("/api/trpc/plannedSessions.applyScenario")) {
        response.statusCode = 500;
        response.end(JSON.stringify([{ error: { message: "no" } }]));
      } else response.end(JSON.stringify([{ error: { message: "not-applied" } }]));
    });
    const transport = await start(sessionId, environment(), port);
    await expect(post(transport.origin, "/other", "{}")).resolves.toMatchObject({ status: 200 });
    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", applyBody("other")),
    ).resolves.toMatchObject({ status: 500 });
    await expect(
      post(
        transport.origin,
        "/api/trpc/plannedSessions.applyScenario?batch=1",
        applyBody(sessionId),
      ),
    ).resolves.toMatchObject({ status: 500 });
    expect(JSON.parse(readFileSync(transport.observationPath, "utf8"))).toEqual({
      dropped: false,
      requests: [
        { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), operationId: "a".repeat(32) },
      ],
    });
  });

  it("forwards 200 stale and unavailable results without consuming the one-shot drop", async () => {
    const results = [
      [{ result: { data: { json: { status: "stale" } } } }],
      [{ result: { data: { json: { status: "unavailable" } } } }],
      appliedResponse(),
    ];
    const port = await upstream((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(results.shift()));
    });
    const transport = await start(sessionId, environment(), port);
    const body = applyBody(sessionId);
    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", body),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", body),
    ).resolves.toMatchObject({ status: 200 });
    expect(JSON.parse(readFileSync(transport.observationPath, "utf8")).dropped).toBe(false);
    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", body),
    ).rejects.toThrow();
  });

  it("forwards an applied envelope for another session without consuming the matching drop", async () => {
    const port = await upstream((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify(
          calls++ === 0
            ? appliedResponse("22222222-2222-4222-8222-222222222222")
            : appliedResponse(),
        ),
      );
    });
    let calls = 0;
    const transport = await start(sessionId, environment(), port);
    const body = applyBody(sessionId);
    const wrong = await post(
      transport.origin,
      "/api/trpc/plannedSessions.applyScenario?batch=1",
      body,
    );
    expect(await wrong.json()).toEqual(appliedResponse("22222222-2222-4222-8222-222222222222"));
    expect(JSON.parse(readFileSync(transport.observationPath, "utf8")).dropped).toBe(false);
    await expect(
      post(transport.origin, "/api/trpc/plannedSessions.applyScenario?batch=1", body),
    ).rejects.toThrow();
  });

  it("clears its timer and listener when an owned child exits during SIGTERM", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild((signal) => {
        if (signal === "SIGTERM") child.emit("exit", null, "SIGTERM");
        return true;
      });
      await expect(stopNativeScenarioTransportChild(child as never, 1)).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      expect(child.listenerCount("exit")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not hang when an owned child exits synchronously during escalation", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild((signal) => {
        if (signal === "SIGKILL") {
          child.signalCode = "SIGKILL";
          child.emit("exit", null, "SIGKILL");
        }
        return true;
      });
      const stopping = stopNativeScenarioTransportChild(child as never, 1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(stopping).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      expect(child.listenerCount("exit")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not signal an already exited child and bounds a child that never exits", async () => {
    const exited = fakeChild(() => {
      throw new Error("kill must not run");
    });
    exited.exitCode = 0;
    await expect(stopNativeScenarioTransportChild(exited as never, 1)).resolves.toBeUndefined();

    vi.useFakeTimers();
    try {
      const child = fakeChild(() => true);
      const stopping = stopNativeScenarioTransportChild(child as never, 1);
      const rejected = expect(stopping).rejects.toThrow(/did not exit/);
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      expect(child.listenerCount("exit")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  function fakeChild(kill: (signal?: NodeJS.Signals) => boolean) {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: (signal?: NodeJS.Signals) => boolean;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = kill;
    return child;
  }

  it("rejects invalid startup input, revokes forwarding after lease loss, and cleans up", async () => {
    const port = await upstream((_request, response) => response.end("ok"));
    const env = environment();
    await expect(
      startNativeScenarioTransport({
        environment: { ...env, E2E_ACCEPTANCE_NATIVE: "0" },
        sessionId,
      }),
    ).rejects.toThrow(/native acceptance runner/);
    await expect(
      startNativeScenarioTransport({ environment: env, sessionId: "../bad" }),
    ).rejects.toThrow(/session identity/);
    const transport = await start(sessionId, env, port);
    unlinkSync(env.E2E_DISPOSABLE_LEASE_PATH ?? "");
    await expect(post(transport.origin, "/other", "{}")).resolves.toMatchObject({ status: 503 });
    await transport.stop();
    await expect(fetch(transport.origin)).rejects.toThrow();
  });

  it("makes direct child invocation fail closed without the parent guard contract", async () => {
    const env = environment();
    const observation = join(
      env.E2E_ACCEPTANCE_ARTIFACTS ?? "",
      "native-scenario-transport-1-00000000-0000-4000-8000-000000000000.json",
    );
    expect(
      await directChildExit({ ...env, E2E_ACCEPTANCE_NATIVE: "0" }, observation, 3100),
    ).not.toBe(0);
    expect(await directChildExit({ ...env, NODE_ENV: "production" }, observation, 45678)).not.toBe(
      0,
    );
    expect(await directChildExit(env, join(tmpdir(), "escaped.json"), 3100)).not.toBe(0);
  });

  it("refuses malformed lease state and oversized request bodies before forwarding", async () => {
    const port = await upstream((_request, response) => response.end("unexpected"));
    const env = environment();
    writeFileSync(env.E2E_DISPOSABLE_LEASE_PATH ?? "", "not-json");
    await expect(
      startNativeScenarioTransport({
        environment: env,
        sessionId,
        upstreamPort: port,
      }),
    ).rejects.toThrow(/Disposable/);
    const valid = environment();
    const transport = await start(sessionId, valid, port);
    await expect(
      post(transport.origin, "/other", "x".repeat(64 * 1024 + 1)),
    ).resolves.toMatchObject({
      status: 413,
    });
    const responsePort = await upstream((_request, response) =>
      response.end("x".repeat(1024 * 1024 + 1)),
    );
    const responseTransport = await start(sessionId, valid, responsePort);
    await expect(post(responseTransport.origin, "/other", "{}")).resolves.toMatchObject({
      status: 502,
    });
  });

  it("closes a stalled request body during owned-child teardown", async () => {
    const port = await upstream((_request, response) => response.end("unexpected"));
    const transport = await start(sessionId, environment(), port);
    const proxyPort = Number(new URL(transport.origin).port);
    const socket = createConnection({ host: "127.0.0.1", port: proxyPort });
    socket.on("error", () => {});
    await once(socket, "connect");
    socket.write("POST /other HTTP/1.1\r\nHost: loopback\r\nContent-Length: 100\r\n\r\npartial");
    await expect(transport.stop()).resolves.toBeUndefined();
    socket.destroy();
  });

  it("fails closed for a malformed absolute request target", async () => {
    const port = await upstream((_request, response) => response.end("unexpected"));
    const transport = await start(sessionId, environment(), port);
    const socket = createConnection({
      host: "127.0.0.1",
      port: Number(new URL(transport.origin).port),
    });
    await once(socket, "connect");
    const response = new Promise<string>((done) => {
      let data = "";
      socket.on("data", (chunk) => (data += chunk));
      socket.on("end", () => done(data));
    });
    socket.end("POST http://[::1 HTTP/1.1\r\nHost: loopback\r\nContent-Length: 0\r\n\r\n");
    await expect(response).resolves.toMatch(/^HTTP\/1\.1 400/);
  });
});
