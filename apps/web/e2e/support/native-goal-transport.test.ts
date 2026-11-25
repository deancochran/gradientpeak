import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDisposableAcceptanceLease } from "./disposable-acceptance-lease";
import { type NativeGoalTransport, startNativeGoalTransport } from "./native-goal-transport";

const goalId = "11111111-1111-4111-8111-111111111111";
const dirs: string[] = [];
const servers: Server[] = [];
const transports: NativeGoalTransport[] = [];

function env() {
  const artifacts = mkdtempSync(join(tmpdir(), "gradientpeak-native-goal-"));
  dirs.push(artifacts);
  const url = "postgresql://x:x@127.0.0.1:54322/gradientpeak_web_acceptance_123_456";
  const lease = createDisposableAcceptanceLease({
    artifacts,
    connectionString: url,
    runId: `goal-${process.pid}`,
  });
  return {
    ...process.env,
    ...lease,
    DATABASE_URL: url,
    POSTGRES_URL: url,
    E2E_ACCEPTANCE_ARTIFACTS: artifacts,
    E2E_ACCEPTANCE_NATIVE: "1",
    E2E_DISPOSABLE_DATABASE: "1",
    E2E_RUN_ID: `goal-${process.pid}`,
    NODE_ENV: "test",
  };
}
async function upstream(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  return address.port;
}
async function bytes(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function goalPath(id = goalId) {
  return `/api/trpc/athleteIntelligence.getGoalProgress?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: { goalId: id } } }))}`;
}
async function start(port: number, environment = env()) {
  const transport = await startNativeGoalTransport({ goalId, environment, upstreamPort: port });
  transports.push(transport);
  return transport;
}
afterEach(async () => {
  await Promise.all(transports.splice(0).map((transport) => transport.stop()));
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("native goal transport", () => {
  it("requires the disposable native guard and rejects direct child bypasses", async () => {
    const port = await upstream((_req, res) => res.end());
    await expect(
      startNativeGoalTransport({
        goalId,
        environment: { ...env(), E2E_ACCEPTANCE_NATIVE: "0" },
        upstreamPort: port,
      }),
    ).rejects.toThrow(/native acceptance/);
    await expect(
      startNativeGoalTransport({ goalId: "bad", environment: env(), upstreamPort: port }),
    ).rejects.toThrow(/session identity/);
    const environment = env();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(import.meta.dirname, "native-goal-transport-child.ts"),
        goalId,
        join(tmpdir(), "escaped.json"),
        String(port),
      ],
      { env: environment },
    );
    const [code] = await once(child, "exit");
    expect(code).not.toBe(0);
  });

  it("fails only the exact goal read until allowed, then preserves upstream bytes", async () => {
    const body = Buffer.from('{"real":"progress"}');
    const port = await upstream((_req, res) => {
      res.statusCode = 207;
      res.setHeader("content-type", "application/json");
      res.end(body);
    });
    const transport = await start(port);
    await expect(fetch(`${transport.origin}${goalPath()}`)).resolves.toMatchObject({ status: 503 });
    expect(await transport.observations()).toEqual({ blocked: 1, forwarded: 0 });
    const other = await fetch(
      `${transport.origin}${goalPath("22222222-2222-4222-8222-222222222222")}`,
    );
    expect(Buffer.from(await other.arrayBuffer())).toEqual(body);
    const procedure = await fetch(`${transport.origin}/api/trpc/other?batch=1`);
    expect(Buffer.from(await procedure.arrayBuffer())).toEqual(body);
    await transport.allowProgressReads();
    const allowed = await fetch(`${transport.origin}${goalPath()}`);
    expect(allowed.status).toBe(207);
    expect(Buffer.from(await allowed.arrayBuffer())).toEqual(body);
    expect(await transport.observations()).toEqual({ blocked: 1, forwarded: 1 });
  });

  it("relays malformed and mixed batches unchanged", async () => {
    const port = await upstream((_req, res) => res.end("relay"));
    const transport = await start(port);
    await expect(
      fetch(
        `${transport.origin}/api/trpc/athleteIntelligence.getGoalProgress?batch=1&input=%7Bbad`,
      ),
    ).resolves.toMatchObject({ status: 200 });
    const mixed = `/api/trpc/athleteIntelligence.getGoalProgress?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: { goalId } }, 1: { json: { goalId } } }))}`;
    await expect(fetch(`${transport.origin}${mixed}`)).resolves.toMatchObject({ status: 200 });
    const duplicate = `${goalPath()}&batch=1`;
    await expect(fetch(`${transport.origin}${duplicate}`)).resolves.toMatchObject({ status: 200 });
    const arrayInput = `/api/trpc/athleteIntelligence.getGoalProgress?batch=1&input=${encodeURIComponent(JSON.stringify([{ json: { goalId } }]))}`;
    await expect(fetch(`${transport.origin}${arrayInput}`)).resolves.toMatchObject({ status: 200 });
    expect(await transport.observations()).toEqual({ blocked: 0, forwarded: 0 });
  });

  it("forwards a non-matching POST body exactly and returns an upstream refusal as 502", async () => {
    const expected = Buffer.from([0, 255, 1, 2, 3]);
    let received: Buffer | undefined;
    const port = await upstream(async (request, response) => {
      received = await bytes(request);
      response.statusCode = 201;
      response.setHeader("content-type", "application/octet-stream");
      response.end(received);
    });
    const transport = await start(port);
    const response = await fetch(`${transport.origin}/api/trpc/other`, {
      method: "POST",
      body: expected,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(expected.length),
      },
    });
    expect(response.status).toBe(201);
    expect(received).toEqual(expected);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
    await transport.stop();

    const unusedPort = await new Promise<number>((resolve) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => resolve(typeof address === "object" && address ? address.port : 1));
      });
    });
    const refused = await start(unusedPort);
    await expect(fetch(`${refused.origin}/other`)).resolves.toMatchObject({ status: 502 });
  });

  it("relays responses larger than the request cap and rejects responses over one MiB", async () => {
    const accepted = Buffer.alloc(80 * 1024, 5);
    const port = await upstream((_request, response) => {
      response.statusCode = 206;
      response.end(accepted);
    });
    const transport = await start(port);
    const response = await fetch(`${transport.origin}/other`);
    expect(response.status).toBe(206);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(accepted);

    const oversizedPort = await upstream((_request, response) =>
      response.end(Buffer.alloc(1024 * 1024 + 1)),
    );
    const oversized = await start(oversizedPort);
    await expect(fetch(`${oversized.origin}/other`)).resolves.toMatchObject({ status: 502 });
  });

  it("rejects an oversized POST without forwarding it", async () => {
    let forwarded = false;
    const port = await upstream((_request, response) => {
      forwarded = true;
      response.end();
    });
    const transport = await start(port);
    const response = await fetch(`${transport.origin}/api/trpc/other`, {
      method: "POST",
      body: Buffer.alloc(64 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(forwarded).toBe(false);
  });

  it("bounds a stalled upstream read and stops an owned child with an open socket", async () => {
    const port = await upstream(() => {});
    const transport = await start(port);
    const began = Date.now();
    await expect(fetch(`${transport.origin}/other`)).resolves.toMatchObject({ status: 502 });
    expect(Date.now() - began).toBeLessThan(12_000);
    const socket = createConnection({
      host: "127.0.0.1",
      port: Number(new URL(transport.origin).port),
    });
    socket.on("error", () => {});
    await once(socket, "connect");
    socket.write("GET /other HTTP/1.1\r\nHost: loopback\r\n");
    await expect(transport.stop()).resolves.toBeUndefined();
    socket.destroy();
  }, 12_000);

  it("serializes concurrent controls and remains healthy", async () => {
    const port = await upstream((_request, response) => response.end("relay"));
    const transport = await start(port);
    await expect(
      Promise.all([transport.allowProgressReads(), transport.observations()]),
    ).resolves.toEqual([undefined, { blocked: 0, forwarded: 0 }]);
    await expect(transport.observations()).resolves.toEqual({ blocked: 0, forwarded: 0 });
  });

  it("observes mixed goal progress and later threshold batches without changing relay bytes", async () => {
    const body = Buffer.from("real-loopback");
    const port = await upstream((_request, response) => response.end(body));
    const transport = await start(port);
    await transport.allowProgressReads();
    const mixed = `/api/trpc/other,athleteIntelligence.getGoalProgress?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: {} }, 1: { json: { goalId } } }))}`;
    const threshold =
      "/api/trpc/athleteIntelligence.getThresholdOverview?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%7D%7D%7D";
    expect(Buffer.from(await (await fetch(`${transport.origin}${mixed}`)).arrayBuffer())).toEqual(
      body,
    );
    expect(
      Buffer.from(await (await fetch(`${transport.origin}${threshold}`)).arrayBuffer()),
    ).toEqual(body);
    expect(await transport.trace()).toEqual([
      {
        method: "GET",
        procedures: ["athleteIntelligence.getGoalProgress"],
        batchSize: 2,
        hasProgress: true,
        hasThreshold: false,
        targetGoalMatched: true,
        requestOrder: 1,
        responseOrder: 1,
        status: 200,
      },
      {
        method: "GET",
        procedures: ["athleteIntelligence.getThresholdOverview"],
        batchSize: 1,
        hasProgress: false,
        hasThreshold: true,
        targetGoalMatched: false,
        requestOrder: 2,
        responseOrder: 2,
        status: 200,
      },
    ]);
    await fetch(`${transport.origin}/api/trpc/unknown?batch=1`);
    expect((await transport.trace()).length).toBe(2);
  });

  it("closes a trickling incomplete request at its absolute body deadline", async () => {
    const port = await upstream((_request, response) => response.end("unexpected"));
    const transport = await start(port);
    const socket = createConnection({
      host: "127.0.0.1",
      port: Number(new URL(transport.origin).port),
    });
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    await once(socket, "connect");
    socket.write("POST /other HTTP/1.1\r\nHost: loopback\r\nContent-Length: 5\r\n\r\na");
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    socket.write("b");
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    socket.write("c");
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    socket.write("d");
    await once(socket, "close");
    expect(Buffer.concat(chunks).toString("utf8")).toContain("408");
  }, 18_000);
});
