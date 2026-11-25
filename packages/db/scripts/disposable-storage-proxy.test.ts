import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { inspect } from "node:util";
import {
  launchDisposableStorageContainer,
  proxyStorageRequest,
} from "./disposable-database-test-harness";

const fabricatedSecret = "TESTsecret-do-not-leak";
const fabricatedArgv = `docker run -e SERVICE_KEY=${fabricatedSecret}`;
const fabricatedEnvironment = `DATABASE_URL=postgresql://role:${fabricatedSecret}@example.test/db`;

function launchError(input: {
  status?: number;
  signal?: string;
  code?: string;
  stderr?: string | Buffer;
  cause?: unknown;
}) {
  const error = new Error(`raw Docker failure ${fabricatedArgv}`, { cause: input.cause });
  Object.assign(error, input);
  return error;
}

function diagnosticFrom(error: unknown) {
  assert.ok(error instanceof Error);
  const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
  const diagnostic = `${error.message}\n${serialized}\n${inspect(error)}`;
  assert.doesNotMatch(diagnostic, new RegExp(fabricatedSecret, "u"));
  assert.doesNotMatch(diagnostic, new RegExp(fabricatedArgv, "u"));
  assert.doesNotMatch(diagnostic, new RegExp(fabricatedEnvironment, "u"));
  assert.doesNotMatch(diagnostic, /raw Docker failure/u);
  return diagnostic;
}

test("disposable Storage launch diagnostics retain safe registry failure details", () => {
  const command = ["run", "-e", fabricatedEnvironment, "storage-api"];
  const failure = launchError({
    status: 125,
    stderr: Buffer.from("denied: ECR Data limit exceeded while pulling image"),
    cause: { argv: fabricatedArgv, token: fabricatedSecret },
  });
  assert.throws(
    () =>
      launchDisposableStorageContainer(command, () => {
        throw failure;
      }),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /stage=storage-api-launch exit=125 signal=none spawn=none/u);
      assert.match(diagnostic, /cause=registry-data-limit/u);
      return true;
    },
  );
});

test("disposable Storage launch diagnostics never expose unknown raw process failures", () => {
  const failure = launchError({
    status: 125,
    stderr: `unexpected Docker output ${fabricatedSecret} ${fabricatedArgv} ${fabricatedEnvironment}`,
    cause: { stderr: fabricatedSecret },
  });
  assert.throws(
    () =>
      launchDisposableStorageContainer(["run", fabricatedArgv], () => {
        throw failure;
      }),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /exit=125/u);
      assert.match(diagnostic, /cause=unknown/u);
      return true;
    },
  );
});

test("disposable Storage launch diagnostics report safe spawn and signal failures", () => {
  const spawnFailure = launchError({ code: "ENOENT", stderr: fabricatedSecret });
  assert.throws(
    () =>
      launchDisposableStorageContainer(["run"], () => {
        throw spawnFailure;
      }),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /exit=none signal=none spawn=ENOENT cause=unknown/u);
      return true;
    },
  );
  const signalFailure = launchError({ signal: "SIGTERM", stderr: fabricatedSecret });
  assert.throws(
    () =>
      launchDisposableStorageContainer(["run"], () => {
        throw signalFailure;
      }),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /exit=none signal=SIGTERM spawn=none cause=unknown/u);
      return true;
    },
  );
});

test("disposable Storage launch helper permits successful Docker commands", () => {
  let invocation: { command: string; args: string[] } | undefined;
  launchDisposableStorageContainer(["run", "storage-api"], (command, args) => {
    invocation = { command, args };
  });
  assert.deepEqual(invocation, { command: "docker", args: ["run", "storage-api"] });
});

test("disposable gateway preserves upstream browser-upload CORS and request bodies", async () => {
  const received: string[] = [];
  const upstream = createServer(async (request, response) => {
    assert.equal(request.url, "/object/upload/sign/activity-files/test");
    response.setHeader("access-control-allow-origin", "http://127.0.0.1:3100");
    response.setHeader("access-control-allow-methods", "PUT, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("vary", "Origin");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    for await (const chunk of request) received.push(String(chunk));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ uploaded: true }));
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const direct = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const gateway = createServer((request, response) => {
    void proxyStorageRequest(request, response, direct);
  });
  await new Promise<void>((done) => gateway.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/storage/v1/object/upload/sign/activity-files/test`;
  try {
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:3100", "Access-Control-Request-Method": "PUT" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:3100");
    assert.equal(preflight.headers.get("access-control-allow-methods"), "PUT, OPTIONS");
    assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type");
    const upload = await fetch(url, {
      method: "PUT",
      body: "synthetic activity",
      headers: { Origin: "http://127.0.0.1:3100", "content-type": "text/plain" },
    });
    assert.equal(upload.headers.get("access-control-allow-origin"), "http://127.0.0.1:3100");
    assert.equal(upload.headers.get("vary"), "Origin");
    assert.deepEqual(await upload.json(), { uploaded: true });
    assert.equal(received.join(""), "synthetic activity");
  } finally {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise<void>((done) => gateway.close(() => done())),
      new Promise<void>((done) => upstream.close(() => done())),
    ]);
  }
});

test("browser gateway supplies an exact loopback CORS policy without upstream CORS", async () => {
  let upstreamCalls = 0;
  const upstream = createServer((_request, response) => {
    upstreamCalls++;
    response.end("uploaded");
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const direct = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const origin = "http://127.0.0.1:3100";
  const gateway = createServer((request, response) => {
    void proxyStorageRequest(request, response, direct, origin);
  });
  await new Promise<void>((done) => gateway.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/storage/v1/object/upload/sign/activity-files/test`;
  try {
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "PUT" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /PUT/);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /content-type/);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /x-forwarded-for/);
    assert.equal(upstreamCalls, 0);
    const denied = await fetch(url, {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(upstreamCalls, 0);
    const upload = await fetch(url, {
      method: "PUT",
      body: "synthetic",
      headers: { Origin: origin },
    });
    assert.equal(upload.headers.get("access-control-allow-origin"), origin);
    assert.equal(await upload.text(), "uploaded");
    assert.equal(upstreamCalls, 1);
  } finally {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise<void>((done) => gateway.close(() => done())),
      new Promise<void>((done) => upstream.close(() => done())),
    ]);
  }
});
