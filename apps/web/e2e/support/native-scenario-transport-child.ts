import { createHash } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  request as upstreamRequest,
} from "node:http";
import { requireDisposableAcceptanceEnvironment } from "./disposable-acceptance-server";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const APPLY_PATH = "/api/trpc/plannedSessions.applyScenario";

const [sessionId, observationPath, upstreamPortText] = process.argv.slice(2);
const upstreamPort = Number(upstreamPortText);
if (!sessionId || !observationPath || !Number.isInteger(upstreamPort))
  throw new Error("Invalid native scenario transport arguments.");
const configuredSessionId = sessionId;
const configuredObservationPath = observationPath;

type Observation = {
  dropped: boolean;
  requests: Array<{ fingerprint: string; operationId: string }>;
};
const observation: Observation = { dropped: false, requests: [] };

function persistObservation() {
  writeFileSync(configuredObservationPath, JSON.stringify(observation), { mode: 0o600 });
  chmodSync(configuredObservationPath, 0o600);
}

function applyIdentity(body: Buffer) {
  if (body.length > MAX_REQUEST_BYTES) return;
  try {
    const parsed = JSON.parse(body.toString("utf8")) as {
      0?: { json?: { operationId?: unknown; preview?: { sessionId?: unknown } } };
    };
    const json = parsed[0]?.json;
    if (
      !json ||
      json.preview?.sessionId !== configuredSessionId ||
      typeof json.operationId !== "string" ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(json.operationId)
    )
      return;
    return {
      fingerprint: createHash("sha256").update(body).digest("hex"),
      operationId: json.operationId,
    };
  } catch {
    return;
  }
}

function appliedResponse(statusCode: number, body: Buffer) {
  if (statusCode < 200 || statusCode > 299 || body.length > MAX_RESPONSE_BYTES) return false;
  try {
    const parsed = JSON.parse(body.toString("utf8")) as unknown;
    const text = JSON.stringify(parsed);
    return text.includes('"result"') && !text.includes('"error"');
  } catch {
    return false;
  }
}

function collect(request: IncomingMessage, limit: number) {
  return new Promise<Buffer | undefined>((resolve) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let settled = false;
    const finish = (value: Buffer | undefined) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    request.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) {
        // Drain rather than reset the socket so this validation failure has a
        // deterministic HTTP response and cannot be mistaken for a lost ACK.
        request.resume();
        finish(undefined);
      } else chunks.push(chunk);
    });
    request.on("end", () => finish(Buffer.concat(chunks)));
    request.on("error", () => finish(undefined));
  });
}

async function forward(request: IncomingMessage, response: ServerResponse) {
  try {
    // A removed/expired lease makes this request unavailable; it never forwards.
    requireDisposableAcceptanceEnvironment();
  } catch {
    response.statusCode = 503;
    response.end("Acceptance runner ownership is unavailable.");
    return;
  }
  const body = await collect(request, MAX_REQUEST_BYTES);
  if (!body) {
    response.statusCode = 413;
    response.end();
    return;
  }
  const matching =
    request.method === "POST" &&
    new URL(request.url ?? "/", "http://loopback").pathname === APPLY_PATH
      ? applyIdentity(body)
      : undefined;
  const upstream = upstreamRequest(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` },
      timeout: 10_000,
    },
    async (upstreamResponse) => {
      const responseBody = await collect(upstreamResponse, MAX_RESPONSE_BYTES);
      if (!responseBody) {
        response.statusCode = 502;
        response.end();
        return;
      }
      if (matching) {
        observation.requests.push(matching);
        persistObservation();
      }
      if (
        matching &&
        !observation.dropped &&
        appliedResponse(upstreamResponse.statusCode ?? 500, responseBody)
      ) {
        observation.dropped = true;
        persistObservation();
        response.socket?.destroy();
        return;
      }
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      response.end(responseBody);
    },
  );
  upstream.on("timeout", () => upstream.destroy());
  upstream.on("error", () => {
    if (!response.headersSent) {
      response.statusCode = 502;
      response.end();
    }
  });
  upstream.end(body);
}

persistObservation();
const server = createServer((request, response) => void forward(request, response));
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") process.exit(1);
  process.send?.({ port: address.port });
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
