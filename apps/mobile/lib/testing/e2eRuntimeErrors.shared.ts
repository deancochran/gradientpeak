const API_REQUEST_TIMEOUT_MS = 30000;
const TIMEOUT_ABORT_THRESHOLD_MS = API_REQUEST_TIMEOUT_MS - 1000;

export type E2ERuntimeErrorKind =
  | "timeout_abort"
  | "server_query_failure"
  | "unexpected_client_error";

export function parseE2EProcedure(message: string) {
  const match = message.match(/<<\s+(?:query|mutation)\s+#\d+\s+([a-zA-Z0-9_.]+)/);
  return match?.[1] ?? null;
}

export function parseE2EElapsedMs(message: string) {
  const match = message.match(/"elapsedMs":\s*(\d+)/);
  return match?.[1] ? Number(match[1]) : null;
}

export function classifyE2ERuntimeMessage(message: string): E2ERuntimeErrorKind | null {
  if (/TRPCClientError:\s*Aborted/i.test(message)) {
    const elapsedMs = parseE2EElapsedMs(message);
    return elapsedMs != null && elapsedMs >= TIMEOUT_ABORT_THRESHOLD_MS ? "timeout_abort" : null;
  }

  if (/Failed query:/i.test(message)) {
    return "server_query_failure";
  }

  if (/TRPCClientError:/i.test(message)) {
    return "unexpected_client_error";
  }

  return null;
}
