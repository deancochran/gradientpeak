import { createHash } from "node:crypto";
import { chmodSync, closeSync, openSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  request as upstreamRequest,
} from "node:http";
import {
  type NativeScenarioTransportObservation,
  requireNativeScenarioTransportGuard,
} from "./native-scenario-transport";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const APPLY_PATH = "/api/trpc/plannedSessions.applyScenario";

const [sessionId, observationPath, upstreamPortText] = process.argv.slice(2);
const upstreamPort = Number(upstreamPortText);
if (!sessionId || !observationPath || !Number.isInteger(upstreamPort))
  throw new Error("Invalid native scenario transport arguments.");
const configuredSessionId = sessionId;
const configuredObservationPath = observationPath;
try {
  requireNativeScenarioTransportGuard({
    observationPath: configuredObservationPath,
    sessionId: configuredSessionId,
    upstreamPort,
  });
  closeSync(openSync(configuredObservationPath, "wx", 0o600));
} catch {
  process.exit(1);
}

const MAX_ATTEMPTS = 8;
const TRPC_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_SUPPORTED",
  "TIMEOUT",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
  "INTERNAL_SERVER_ERROR",
  "NOT_IMPLEMENTED",
  "BAD_GATEWAY",
  "SERVICE_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
]);
const observation: NativeScenarioTransportObservation = {
  attempts: [],
  dropped: false,
  requests: [],
  unmatchedApplyRequests: 0,
};

function persistObservation() {
  writeFileSync(configuredObservationPath, JSON.stringify(observation), { flag: "w", mode: 0o600 });
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
    const parsed = JSON.parse(body.toString("utf8")) as Array<{
      result?: { data?: { json?: { status?: unknown; session?: { id?: unknown } } } };
    }>;
    return (
      Array.isArray(parsed) &&
      parsed.length === 1 &&
      parsed[0]?.result?.data?.json?.status === "applied" &&
      parsed[0].result.data.json.session?.id === configuredSessionId
    );
  } catch {
    return false;
  }
}

function trpcErrorCode(body: Buffer) {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as Array<{
      error?: { data?: { code?: unknown } };
    }>;
    const code = parsed[0]?.error?.data?.code;
    return typeof code === "string" && TRPC_ERROR_CODES.has(code) ? code : undefined;
  } catch {
    return;
  }
}

function recordAttempt(identity: NonNullable<ReturnType<typeof applyIdentity>>) {
  if (observation.attempts.length >= MAX_ATTEMPTS) return;
  const attempt = { ...identity };
  observation.attempts.push(attempt);
  persistObservation();
  return attempt;
}

function finishAttempt(
  attempt: NativeScenarioTransportObservation["attempts"][number] | undefined,
  terminal: NonNullable<NativeScenarioTransportObservation["attempts"][number]["terminal"]>,
) {
  if (!attempt || attempt.terminal) return;
  attempt.terminal = terminal;
  persistObservation();
}

function upstreamErrorCode(error: NodeJS.ErrnoException) {
  if (error.code === "ECONNREFUSED") return "connection-refused";
  if (error.code === "ECONNRESET") return "connection-reset";
  return "other";
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
    request.setTimeout(REQUEST_TIMEOUT_MS, () => finish(undefined));
  });
}

async function forward(request: IncomingMessage, response: ServerResponse) {
  try {
    // A removed/expired lease makes this request unavailable; it never forwards.
    requireNativeScenarioTransportGuard({
      observationPath: configuredObservationPath,
      sessionId: configuredSessionId,
      upstreamPort,
    });
  } catch {
    response.statusCode = 503;
    response.end("Acceptance runner ownership is unavailable.");
    return;
  }
  let isApplyRequest = false;
  try {
    isApplyRequest =
      request.method === "POST" &&
      new URL(request.url ?? "/", "http://loopback").pathname === APPLY_PATH;
  } catch {
    response.statusCode = 400;
    response.end();
    return;
  }
  const body = await collect(request, MAX_REQUEST_BYTES);
  if (!body) {
    if (isApplyRequest) {
      observation.unmatchedApplyRequests++;
      persistObservation();
    }
    response.statusCode = 413;
    response.end();
    return;
  }
  let matching: ReturnType<typeof applyIdentity>;
  let attempt: NativeScenarioTransportObservation["attempts"][number] | undefined;
  if (isApplyRequest) {
    matching = applyIdentity(body);
    if (!matching) {
      observation.unmatchedApplyRequests++;
      persistObservation();
    } else {
      attempt = recordAttempt(matching);
    }
  }
  let upstream: ReturnType<typeof upstreamRequest>;
  try {
    upstream = upstreamRequest(
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
          if (matching)
            finishAttempt(attempt, {
              classification: "response-unavailable",
              httpStatus: upstreamResponse.statusCode ?? 502,
            });
          response.statusCode = 502;
          response.end();
          return;
        }
        if (matching) {
          observation.requests.push({ ...matching });
          persistObservation();
        }
        if (
          matching &&
          !observation.dropped &&
          appliedResponse(upstreamResponse.statusCode ?? 500, responseBody)
        ) {
          observation.dropped = true;
          finishAttempt(attempt, {
            classification: "response",
            httpStatus: upstreamResponse.statusCode ?? 500,
            relay: "dropped-after-upstream-applied",
          });
          persistObservation();
          response.socket?.destroy();
          return;
        }
        if (matching) {
          const errorCode = trpcErrorCode(responseBody);
          finishAttempt(attempt, {
            classification: "response",
            httpStatus: upstreamResponse.statusCode ?? 502,
            relay: "relayed",
            ...(errorCode ? { trpcErrorCode: errorCode } : {}),
          });
        }
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        response.end(responseBody);
      },
    );
  } catch {
    response.statusCode = 502;
    response.end();
    return;
  }
  upstream.on("timeout", () => {
    if (matching) finishAttempt(attempt, { classification: "upstream-timeout" });
    upstream.destroy();
  });
  upstream.on("error", (error: NodeJS.ErrnoException) => {
    if (matching)
      finishAttempt(attempt, {
        classification: "upstream-error",
        upstreamErrorCode: upstreamErrorCode(error),
      });
    if (!response.headersSent) {
      response.statusCode = 502;
      response.end();
    }
  });
  upstream.end(body);
}

persistObservation();
const sockets = new Set<import("node:net").Socket>();
const server = createServer((request, response) => void forward(request, response));
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") process.exit(1);
  process.send?.({ port: address.port });
});
process.on("SIGTERM", () => {
  for (const socket of sockets) socket.destroy();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1_000);
});
