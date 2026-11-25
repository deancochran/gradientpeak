import { spawn } from "node:child_process";

const MAX_CAPTURED_RECORDS = 2;
const MAX_LINE_BYTES = 1024;
const SAFE_ERROR_CLASSES = new Set([
  "TRPCClientError",
  "ApiRequestTimeoutError",
  "AbortError",
  "TypeError",
  "UnknownError",
]);
const SAFE_TRPC_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "INTERNAL_SERVER_ERROR",
]);

export type NativePlannedSessionErrorDiagnostic = {
  applicationErrorCode: string | null;
  errorClass: string;
  httpStatus: number | null;
  trpcCode: string | null;
};

export function parseNativePlannedSessionError(
  line: string,
): NativePlannedSessionErrorDiagnostic | null {
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) return null;
  const match = line.match(/\[api\]\s+plannedSessions\.getById\s+(\{.*\})/);
  if (!match?.[1]) return null;
  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    const errorClass =
      typeof value.errorClass === "string" && SAFE_ERROR_CLASSES.has(value.errorClass)
        ? value.errorClass
        : null;
    if (!errorClass) return null;
    return {
      applicationErrorCode: null,
      errorClass,
      httpStatus:
        typeof value.httpStatus === "number" &&
        Number.isInteger(value.httpStatus) &&
        value.httpStatus >= 400 &&
        value.httpStatus <= 599
          ? value.httpStatus
          : null,
      trpcCode:
        typeof value.trpcCode === "string" && SAFE_TRPC_CODES.has(value.trpcCode)
          ? value.trpcCode
          : null,
    };
  } catch {
    return null;
  }
}

export function captureNativePlannedSessionErrors(pid: string) {
  const records: NativePlannedSessionErrorDiagnostic[] = [];
  const child = spawn("adb", ["-s", "emulator-5554", "logcat", "--pid", pid, "-v", "brief"]);
  let pending = "";
  child.stdout.on("data", (chunk: Buffer) => {
    pending = `${pending}${chunk.toString("utf8")}`.slice(-MAX_LINE_BYTES * 2);
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const diagnostic = parseNativePlannedSessionError(line);
      if (diagnostic && records.length < MAX_CAPTURED_RECORDS) records.push(diagnostic);
    }
  });
  return {
    stop: async () => {
      child.kill("SIGTERM");
      if (child.exitCode !== null) return records;
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      return records;
    },
  };
}
