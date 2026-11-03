import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { proxyStorageRequest } from "./disposable-database-test-harness";

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
