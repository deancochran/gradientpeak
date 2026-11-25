import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
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
    expect(await transport.observations()).toEqual({ blocked: 0, forwarded: 0 });
  });
});
