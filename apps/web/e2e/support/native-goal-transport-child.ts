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
const persist = () => {
  writeFileSync(observationPath, JSON.stringify(counts), { flag: "w", mode: 0o600 });
  chmodSync(observationPath, 0o600);
};
function matches(request: IncomingMessage) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url ?? "/", "http://loopback");
  if (
    url.pathname !== "/api/trpc/athleteIntelligence.getGoalProgress" ||
    url.searchParams.get("batch") !== "1"
  )
    return false;
  const input = url.searchParams.get("input");
  if (!input) return false;
  try {
    const parsed = JSON.parse(input) as { 0?: { json?: { goalId?: unknown } } };
    return Object.keys(parsed).length === 1 && parsed[0]?.json?.goalId === goalId;
  } catch {
    return false;
  }
}
const server = createServer((request, response) => {
  try {
    requireNativeScenarioTransportGuard({ sessionId: goalId, upstreamPort });
    if (matches(request) && !allowed) {
      counts.blocked++;
      persist();
      response.statusCode = 503;
      response.end("Acceptance runner ownership is unavailable.");
      return;
    }
  } catch {
    response.statusCode = 503;
    response.end("Acceptance runner ownership is unavailable.");
    return;
  }
  const upstream = upstreamRequest(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` },
      timeout: 10_000,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => response.end());
  upstream.end();
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
process.on("message", (message: { type?: string }) => {
  try {
    requireNativeScenarioTransportGuard({ sessionId: goalId, upstreamPort });
    if (message.type === "allow") allowed = true;
    if (message.type === "allow") process.send?.({ type: "allow", ok: true });
    if (message.type === "observations")
      process.send?.({ type: "observations", ok: true, ...counts });
  } catch {
    process.send?.({ type: message.type, ok: false });
  }
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
