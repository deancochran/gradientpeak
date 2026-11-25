import { chmodSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, request as upstreamRequest } from "node:http";
import { basename, dirname } from "node:path";
import { requireNativeScenarioTransportGuard } from "./native-scenario-transport";

const [goalId, observationPath, portText] = process.argv.slice(2);
const upstreamPort = Number(portText);
if (!goalId || !observationPath || !Number.isInteger(upstreamPort)) process.exit(1);
try {
  const { artifacts } = requireNativeScenarioTransportGuard({ sessionId: goalId, upstreamPort });
  if (
    dirname(observationPath) !== artifacts ||
    !/^native-goal-transport-\d+-[0-9a-f-]{36}\.json$/.test(basename(observationPath))
  )
    throw new Error("Invalid native goal observation path.");
} catch {
  process.exit(1);
}
let allowed = false;
const counts = { blocked: 0, forwarded: 0 };
const sockets = new Set<import("node:net").Socket>();
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const CLIENT_BODY_TIMEOUT_MS = 10_000;
const CLIENT_BODY_ABSOLUTE_TIMEOUT_MS = 15_000;
const UPSTREAM_INACTIVITY_TIMEOUT_MS = 10_000;
const UPSTREAM_ABSOLUTE_TIMEOUT_MS = 15_000;
const MAX_TRACE_RECORDS = 32;
const GOAL_PROCEDURES = new Set([
  "athleteIntelligence.getGoalAssessment",
  "athleteIntelligence.getGoalProgress",
  "athleteIntelligence.getThresholdOverview",
]);
type GoalProcedure =
  | "athleteIntelligence.getGoalAssessment"
  | "athleteIntelligence.getGoalProgress"
  | "athleteIntelligence.getThresholdOverview";
type Trace = {
  method: string;
  procedures: GoalProcedure[];
  batchSize: number;
  hasProgress: boolean;
  hasThreshold: boolean;
  targetGoalMatched: boolean;
  requestOrder: number;
  responseOrder?: number;
  status?: number;
};
const trace: Trace[] = [];
let eventOrder = 0;
const persist = () => {
  writeFileSync(observationPath, JSON.stringify(counts), { flag: "w", mode: 0o600 });
  chmodSync(observationPath, 0o600);
};
function matches(request: IncomingMessage) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url ?? "/", "http://loopback");
  if (
    url.pathname !== "/api/trpc/athleteIntelligence.getGoalProgress" ||
    url.searchParams.get("batch") !== "1" ||
    url.searchParams.getAll("batch").length !== 1 ||
    url.searchParams.getAll("input").length !== 1
  )
    return false;
  const input = url.searchParams.get("input");
  if (!input) return false;
  try {
    const parsed = JSON.parse(input) as { 0?: { json?: { goalId?: unknown } } };
    return (
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 &&
      parsed[0]?.json?.goalId === goalId
    );
  } catch {
    return false;
  }
}
function body(
  request: IncomingMessage,
  {
    limit = MAX_RESPONSE_BYTES,
    timeoutMs = UPSTREAM_INACTIVITY_TIMEOUT_MS,
    absoluteTimeoutMs,
    drainOnFailure = false,
  }: {
    limit?: number;
    timeoutMs?: number;
    absoluteTimeoutMs?: number;
    drainOnFailure?: boolean;
  } = {},
) {
  return new Promise<{ body: Buffer } | { failure: "oversize" | "timeout" | "error" }>(
    (resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
      let absoluteTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (value: { body: Buffer } | { failure: "oversize" | "timeout" | "error" }) => {
        if (settled) return;
        settled = true;
        request.off("data", onData);
        request.off("end", onEnd);
        request.off("error", onError);
        request.off("aborted", onError);
        if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
        if (absoluteTimer !== undefined) clearTimeout(absoluteTimer);
        if ("failure" in value && drainOnFailure) request.resume();
        resolve(value);
      };
      const resetTimeout = () => {
        if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => finish({ failure: "timeout" }), timeoutMs);
      };
      const onData = (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          request.resume();
          finish({ failure: "oversize" });
          return;
        }
        chunks.push(chunk);
        resetTimeout();
      };
      const onEnd = () => finish({ body: Buffer.concat(chunks) });
      const onError = () => finish({ failure: "error" });
      request.on("data", onData);
      request.once("end", onEnd);
      request.once("error", onError);
      request.once("aborted", onError);
      resetTimeout();
      if (absoluteTimeoutMs !== undefined)
        absoluteTimer = setTimeout(() => finish({ failure: "timeout" }), absoluteTimeoutMs);
    },
  );
}
function traceRequest(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://loopback");
  const prefix = "/api/trpc/";
  if (!url.pathname.startsWith(prefix)) return;
  const allProcedures = url.pathname.slice(prefix.length).split(",");
  const entries = allProcedures.flatMap((procedure, index) =>
    GOAL_PROCEDURES.has(procedure) ? [{ procedure: procedure as GoalProcedure, index }] : [],
  );
  if (!entries.length) return;
  const procedures = entries.map(({ procedure }) => procedure);
  let targetGoalMatched = false;
  try {
    const input = url.searchParams.get("input");
    const parsed = input
      ? (JSON.parse(input) as Record<string, { json?: { goalId?: unknown } }>)
      : {};
    targetGoalMatched = entries.some(
      ({ procedure, index }) =>
        procedure !== "athleteIntelligence.getThresholdOverview" &&
        parsed[index]?.json?.goalId === goalId,
    );
  } catch {
    // Metadata retains only the failed-to-parse request shape, never its input.
  }
  const record: Trace = {
    method: request.method ?? "UNKNOWN",
    procedures,
    batchSize: Math.min(allProcedures.length, MAX_TRACE_RECORDS),
    hasProgress: procedures.includes("athleteIntelligence.getGoalProgress"),
    hasThreshold: procedures.includes("athleteIntelligence.getThresholdOverview"),
    targetGoalMatched,
    requestOrder: ++eventOrder,
  };
  if (trace.length === MAX_TRACE_RECORDS) trace.shift();
  trace.push(record);
  return record;
}
const server = createServer(async (request, response) => {
  const requestTrace = traceRequest(request);
  const finishTrace = (status: number) => {
    if (!requestTrace || requestTrace.responseOrder !== undefined) return;
    requestTrace.responseOrder = ++eventOrder;
    requestTrace.status = status;
  };
  const respond = (
    statusCode: number,
    headers?: import("node:http").OutgoingHttpHeaders,
    value?: Buffer | string,
  ) => {
    if (response.writableEnded || response.destroyed) return;
    if (headers) response.writeHead(statusCode, headers);
    else response.statusCode = statusCode;
    response.end(value);
    finishTrace(statusCode);
  };
  try {
    requireNativeScenarioTransportGuard({ sessionId: goalId, upstreamPort });
    if (matches(request) && !allowed) {
      counts.blocked++;
      persist();
      respond(503, undefined, "Acceptance runner ownership is unavailable.");
      return;
    }
  } catch {
    respond(503, undefined, "Acceptance runner ownership is unavailable.");
    return;
  }
  const requestBody = await body(request, {
    limit: MAX_REQUEST_BYTES,
    timeoutMs: CLIENT_BODY_TIMEOUT_MS,
    absoluteTimeoutMs: CLIENT_BODY_ABSOLUTE_TIMEOUT_MS,
    drainOnFailure: true,
  });
  if ("failure" in requestBody) {
    if (requestBody.failure === "oversize") respond(413);
    else respond(408, { connection: "close" });
    return;
  }
  let settled = false;
  let absoluteTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = (
    statusCode: number,
    headers?: import("node:http").OutgoingHttpHeaders,
    value?: Buffer | string,
  ) => {
    if (settled) return;
    settled = true;
    if (absoluteTimer !== undefined) clearTimeout(absoluteTimer);
    respond(statusCode, headers, value);
  };
  const upstream = upstreamRequest(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` },
    },
    async (upstreamResponse) => {
      const responseBody = await body(upstreamResponse);
      if ("failure" in responseBody) {
        upstream.destroy();
        finish(502);
        return;
      }
      finish(upstreamResponse.statusCode ?? 502, upstreamResponse.headers, responseBody.body);
    },
  );
  absoluteTimer = setTimeout(() => {
    upstream.destroy();
    finish(502);
  }, UPSTREAM_ABSOLUTE_TIMEOUT_MS);
  upstream.on("timeout", () => {
    upstream.destroy();
    finish(502);
  });
  upstream.on("error", () => {
    finish(502);
  });
  upstream.setTimeout(UPSTREAM_INACTIVITY_TIMEOUT_MS);
  response.once("close", () => {
    if (!response.writableEnded) {
      upstream.destroy();
      finish(502);
    }
  });
  upstream.end(requestBody.body);
  if (matches(request)) {
    counts.forwarded++;
    persist();
  }
});
persist();
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") process.send?.({ type: "ready", port: address.port });
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
process.on("message", (message: { type?: string }) => {
  try {
    requireNativeScenarioTransportGuard({ sessionId: goalId, upstreamPort });
    if (message.type === "allow") allowed = true;
    if (message.type === "allow") process.send?.({ type: "allow", ok: true });
    if (message.type === "observations")
      process.send?.({ type: "observations", ok: true, ...counts });
    if (message.type === "trace") process.send?.({ type: "trace", ok: true, records: trace });
  } catch {
    process.send?.({ type: message.type, ok: false });
  }
});
process.on("SIGTERM", () => {
  for (const socket of sockets) socket.destroy();
  server.close(() => process.exit(0));
});
