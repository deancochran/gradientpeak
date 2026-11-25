import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const MAX_CAPTURED_RECORDS = 2;
const MAX_LINE_BYTES = 1024;
const DEFAULT_STOP_TIMEOUT_MS = 2_000;
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

type CaptureStatus =
  | "captured"
  | "no_safe_error"
  | "unrecognized_relevant_format"
  | "capture_failed"
  | "capture_timed_out";

export type NativePlannedSessionCapture = {
  records: NativePlannedSessionErrorDiagnostic[];
  status: CaptureStatus;
  truncated: boolean;
};

type LogcatChild = Pick<ChildProcessWithoutNullStreams, "kill" | "once" | "stdout">;

type CaptureOptions = {
  closeGraceMs?: number;
  spawnLogcat?: (pid: string) => LogcatChild;
  stopTimeoutMs?: number;
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
const RELEVANT_PROCEDURE = /\[api\]\s+plannedSessions\.getById\b/;

/** Parses only the observed finite React Native console format; raw lines are never retained. */
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
  let discardingOverlongLine = false;
  let truncated = false;
  let unrecognizedRelevantFormat = false;
  let failed = false;
  let closed = false;
  let stopPromise: Promise<NativePlannedSessionCapture> | undefined;
  const decoder = new StringDecoder("utf8");
  let child: LogcatChild | undefined;

  const consume = (line: string) => {
    const diagnostic = parseNativePlannedSessionError(line);
    if (diagnostic && records.length < MAX_CAPTURED_RECORDS) records.push(diagnostic);
    else if (RELEVANT_PROCEDURE.test(line)) unrecognizedRelevantFormat = true;
  };
  const receive = (text: string, final = false) => {
    let start = 0;
    for (;;) {
      const newline = text.indexOf("\n", start);
      if (newline === -1) break;
      const segment = text.slice(start, newline);
      start = newline + 1;
      if (discardingOverlongLine) {
        discardingOverlongLine = false;
        continue;
      }
      const line = `${pending}${segment}`;
      pending = "";
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
        truncated = true;
        continue;
      }
      consume(line);
    }
    const tail = text.slice(start);
    if (discardingOverlongLine) return;
    pending += tail;
    if (Buffer.byteLength(pending) > MAX_LINE_BYTES) {
      pending = "";
      truncated = true;
      discardingOverlongLine = true;
    }
    if (final && pending) {
      consume(pending);
      pending = "";
    }
  };
  const flush = () => receive(decoder.end(), true);

  try {
    child = options.spawnLogcat?.(pid) ?? defaultSpawnLogcat(pid);
    child.stdout.on("data", (chunk: Buffer) => receive(decoder.write(chunk)));
    child.once("error", () => {
      failed = true;
    });
    child.once("close", () => {
      closed = true;
      flush();
    });
  } catch {
    failed = true;
    closed = true;
  }

  const result = (timedOut: boolean): NativePlannedSessionCapture => ({
    records,
    status: timedOut
      ? "capture_timed_out"
      : failed
        ? "capture_failed"
        : unrecognizedRelevantFormat || truncated
          ? "unrecognized_relevant_format"
          : records.length
            ? "captured"
            : "no_safe_error",
    truncated,
  });

  return {
    stop: () => {
      if (stopPromise !== undefined) return stopPromise;
      stopPromise = new Promise<NativePlannedSessionCapture>((resolve) => {
        if (!child || closed) {
          flush();
          resolve(result(false));
          return;
        }
        let settled = false;
        let timedOut = false;
        let closeGrace: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(stopTimeout);
          if (closeGrace) clearTimeout(closeGrace);
          resolve(result(timedOut));
        };
        const stopTimeout = setTimeout(() => {
          timedOut = true;
          child?.kill("SIGKILL");
          closeGrace = setTimeout(finish, options.closeGraceMs ?? DEFAULT_STOP_TIMEOUT_MS);
        }, options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
        child.once("close", finish);
        child.kill("SIGTERM");
      });
      return stopPromise;
    },
  };
}

export function captureWorkspaceNativeErrors(
  workspaceOnly: boolean,
  pid: string | undefined,
  options: CaptureOptions = {},
) {
  return workspaceOnly && pid ? captureNativePlannedSessionErrors(pid, options) : null;
}
