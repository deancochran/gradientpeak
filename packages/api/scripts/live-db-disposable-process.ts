import { spawn } from "node:child_process";

export function requireDisposableProcessGroups(platform = process.platform) {
  if (platform === "win32")
    throw new Error("Guarded live-DB execution requires POSIX process groups.");
}

/** Wait for the owned child to exit before the enclosing database is removed. */
export async function runLiveDbProcess(
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal },
) {
  requireDisposableProcessGroups();
  options.signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
      detached: true,
    });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    const abort = () => {
      stop("SIGTERM");
      killTimer = setTimeout(() => stop("SIGKILL"), 5_000);
      killTimer.unref();
    };
    options.signal.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      options.signal.removeEventListener("abort", abort);
      // The direct child may exit before a worker that ignores SIGTERM.
      if (options.signal.aborted) stop("SIGKILL");
      clearTimeout(killTimer);
      if (options.signal.aborted) reject(new Error("Live database tests interrupted."));
      else if (code === 0) resolve();
      else reject(new Error(`Live database tests exited with ${code ?? signal}.`));
    });
  });
}
