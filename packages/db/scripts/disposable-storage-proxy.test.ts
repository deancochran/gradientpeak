import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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

function runNodeChild(script: string) {
  return launchDisposableStorageContainer(
    ["run", "-e", fabricatedEnvironment, fabricatedArgv],
    (_command, _args, options) => spawn(process.execPath, ["-e", script], options),
  );
}

function diagnosticFrom(error: unknown) {
  assert.ok(error instanceof Error);
  assert.equal(Object.hasOwn(error, "cause"), false);
  const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
  const diagnostic = `${error.message}\n${serialized}\n${inspect(error)}`;
  assert.doesNotMatch(diagnostic, new RegExp(fabricatedSecret, "u"));
  assert.doesNotMatch(diagnostic, new RegExp(fabricatedArgv, "u"));
  assert.doesNotMatch(diagnostic, new RegExp(fabricatedEnvironment, "u"));
  assert.doesNotMatch(diagnostic, /raw Docker failure/u);
  return diagnostic;
}

test("disposable Storage launch drains verbose successful stderr without terminating the child", async () => {
  await runNodeChild("process.stderr.write('x'.repeat(20000))");
});

test("disposable Storage launch diagnostics retain only fixed failure categories", async () => {
  const categories = [
    ["registry-data-limit", "denied: ECR Data limit exceeded"],
    ["registry-rate-limit", "toomanyrequests: rate limit exceeded"],
    ["image-unavailable", "manifest unknown"],
    ["daemon-permission", "permission denied while connecting to Docker"],
    ["daemon-unavailable", "Cannot connect to the Docker daemon"],
    ["unknown", "unexpected daemon result"],
  ] as const;
  for (const [category, message] of categories) {
    await assert.rejects(
      runNodeChild(
        `process.stderr.write('x'.repeat(12000) + ${JSON.stringify(`${message} ${fabricatedSecret} ${fabricatedArgv} ${fabricatedEnvironment}`)}); process.exit(125)`,
      ),
      (error) => {
        const diagnostic = diagnosticFrom(error);
        assert.match(diagnostic, /stage=storage-api-launch exit=125 signal=none spawn=none/u);
        assert.match(diagnostic, new RegExp(`cause=${category}`, "u"));
        return true;
      },
    );
  }
});

test("disposable Storage launch diagnostics report real spawn and signal failures", async () => {
  await assert.rejects(
    launchDisposableStorageContainer(["run"], (_command, _args, options) =>
      spawn("/definitely-not-a-disposable-storage-command", [], options),
    ),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /exit=none signal=none spawn=ENOENT cause=unknown/u);
      return true;
    },
  );
  await assert.rejects(
    runNodeChild("process.stderr.write('x'.repeat(12000)); process.kill(process.pid, 'SIGTERM')"),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /exit=none signal=SIGTERM spawn=none cause=unknown/u);
      return true;
    },
  );
});

test("disposable Storage launch diagnostics discard a synchronous executor cause", async () => {
  const raw = Object.assign(
    new Error(`raw executor ${fabricatedArgv}`, { cause: fabricatedSecret }),
    {
      code: "ENOENT",
      stderr: `${fabricatedSecret} ${fabricatedEnvironment}`,
    },
  );
  await assert.rejects(
    launchDisposableStorageContainer(["run", fabricatedArgv], () => {
      throw raw;
    }),
    (error) => {
      const diagnostic = diagnosticFrom(error);
      assert.match(diagnostic, /exit=none signal=none spawn=ENOENT cause=unknown/u);
      return true;
    },
  );
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
