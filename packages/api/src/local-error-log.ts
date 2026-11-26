import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { getLocalErrorLogPath, LOCAL_ERROR_LOG_DIRECTORY } from "./local-error-log-path.mjs";
import { sanitizeTelemetryContext } from "./telemetry-sanitizer.mjs";

const MAX_BYTES = 1_000_000;
const MAX_QUEUE_SIZE = 100;

type LocalWriterOptions = {
  enabled?: boolean;
  path?: string | null;
  logDirectory?: string;
};

async function rejectSymlink(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Refusing symbolic link");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function createLocalErrorWriter({
  enabled = false,
  path,
  logDirectory = LOCAL_ERROR_LOG_DIRECTORY,
}: LocalWriterOptions = {}) {
  const resolvedPath = path === undefined ? getLocalErrorLogPath() : path;
  const queue: Record<string, unknown>[] = [];
  let draining = false;
  let dropped = 0;

  async function append(event: Record<string, unknown>) {
    if (!resolvedPath || dirname(resolvedPath) !== logDirectory) return;

    await mkdir(logDirectory, { recursive: true, mode: 0o700 });
    await rejectSymlink(logDirectory);
    await chmod(logDirectory, 0o700);
    await rejectSymlink(resolvedPath);
    try {
      if ((await lstat(resolvedPath)).size >= MAX_BYTES) {
        const backupPath = `${resolvedPath}.1`;
        await rejectSymlink(backupPath);
        await rename(resolvedPath, backupPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const file = await open(
      resolvedPath,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.chmod(0o600);
      await file.write(`${JSON.stringify(event)}\n`);
    } finally {
      await file.close();
    }
  }

  async function drain() {
    try {
      while (queue.length > 0) {
        const event = queue.shift();
        if (event) await append(event);
      }
      if (dropped > 0) {
        const droppedCount = dropped;
        dropped = 0;
        await append(
          sanitizeTelemetryContext({
            diagnostic_category: "unknown",
            diagnostic_reason: "unexpected",
            dropped_count: droppedCount,
            safe_summary: "An unexpected error occurred.",
          }),
        );
      }
    } catch {
      // Local diagnostics must never affect a product path.
    } finally {
      draining = false;
      if (queue.length > 0 || dropped > 0) scheduleDrain();
    }
  }

  function scheduleDrain() {
    if (draining) return;
    draining = true;
    void drain();
  }

  return {
    write(context: Record<string, unknown>) {
      if (!enabled || !resolvedPath) return;
      if (queue.length + (draining ? 1 : 0) >= MAX_QUEUE_SIZE) {
        dropped += 1;
        return;
      }
      queue.push({ timestamp: new Date().toISOString(), ...sanitizeTelemetryContext(context) });
      scheduleDrain();
    },
    async flushForTest() {
      while (draining) await new Promise((resolve) => setTimeout(resolve, 1));
    },
  };
}

const defaultWriter = createLocalErrorWriter({
  enabled: process.env.ENABLE_LOCAL_ERROR_LOG === "1",
});

export function writeLocalErrorEvent(context: Record<string, unknown>) {
  defaultWriter.write(context);
}
