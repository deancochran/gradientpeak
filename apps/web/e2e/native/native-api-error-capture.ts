import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

const MAX_CAPTURED_RECORDS = 2;
const MAX_LINE_BYTES = 1024;
const SAFE_APPLICATION_ERROR_CODES = new Set([
  "ONBOARDING_PENDING_OAUTH",
  "ACTIVITY_PLAN_INTEGRITY_FAILED",
]);
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

type CaptureStatus = "captured" | "no_safe_error" | "capture_failed" | "capture_timed_out";

export type NativePlannedSessionCapture = {
  records: NativePlannedSessionErrorDiagnostic[];
  status: CaptureStatus;
};

type LogcatChild = Pick<ChildProcessWithoutNullStreams, "exitCode" | "kill" | "once" | "stdout">;

type CaptureOptions = {
  killTimeoutMs?: number;
  spawnLogcat?: (pid: string) => LogcatChild;
};

function safeValue(value: string, allowed: ReadonlySet<string>): string | null {
  return allowed.has(value) ? value : null;
}

function nullableString(pattern: string) {
  return `(?:null|"(${pattern})")`;
}

const API_ERROR_LINE = new RegExp(
  String.raw`\[api\]\s+plannedSessions\.getById\s+\{"applicationErrorCode":\s*${nullableString(
    "[A-Z_]+",
  )},\s*"errorClass":\s*"([A-Za-z]+)",\s*"httpStatus":\s*(null|[45]\d{2}),\s*"trpcCode":\s*${nullableString(
    "[A-Z_]+",
  )}\}`,
);

/** Parses only the known finite React Native console format; raw lines are never retained. */
export function parseNativePlannedSessionError(
  line: string,
): NativePlannedSessionErrorDiagnostic | null {
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) return null;
  const match = line.match(API_ERROR_LINE);
  if (!match) return null;
  const applicationErrorCode = match[1] ? safeValue(match[1], SAFE_APPLICATION_ERROR_CODES) : null;
  const errorClass = safeValue(match[2] ?? "", SAFE_ERROR_CLASSES);
  const httpStatus = match[3] === "null" ? null : Number(match[3]);
  const trpcCode = match[4] ? safeValue(match[4], SAFE_TRPC_CODES) : null;
  if (!errorClass || (match[1] && !applicationErrorCode) || (match[4] && !trpcCode)) return null;
  return { applicationErrorCode, errorClass, httpStatus, trpcCode };
}

function defaultSpawnLogcat(pid: string): LogcatChild {
  return spawn("adb", ["-s", "emulator-5554", "logcat", "--pid", pid, "-v", "brief"]);
}

export function captureNativePlannedSessionErrors(pid: string, options: CaptureOptions = {}) {
  const records: NativePlannedSessionErrorDiagnostic[] = [];
  let pending = "";
  let failure = false;
  const child = options.spawnLogcat?.(pid) ?? defaultSpawnLogcat(pid);
  const consume = (line: string) => {
    const diagnostic = parseNativePlannedSessionError(line);
    if (diagnostic && records.length < MAX_CAPTURED_RECORDS) records.push(diagnostic);
  };
  child.stdout.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    if (Buffer.byteLength(pending) > MAX_LINE_BYTES) {
      pending = "";
      return;
    }
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    lines.forEach(consume);
  });
  child.once("error", () => {
    failure = true;
  });

  return {
    stop: () =>
      new Promise<NativePlannedSessionCapture>((resolve) => {
        let settled = false;
        const finish = (status: CaptureStatus) => {
          if (settled) return;
          settled = true;
          if (pending) consume(pending);
          pending = "";
          resolve({ records, status: records.length ? "captured" : status });
        };
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          finish("capture_timed_out");
        }, options.killTimeoutMs ?? 2_000);
        child.once("close", () => {
          clearTimeout(timeout);
          finish(failure ? "capture_failed" : "no_safe_error");
        });
        child.kill("SIGTERM");
        if (child.exitCode !== null)
          queueMicrotask(() => finish(failure ? "capture_failed" : "no_safe_error"));
      }),
  };
}

export function captureWorkspaceNativeErrors(
  workspaceOnly: boolean,
  pid: string | undefined,
  options: CaptureOptions = {},
) {
  return workspaceOnly && pid ? captureNativePlannedSessionErrors(pid, options) : null;
}
