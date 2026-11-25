import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { requireDisposableAcceptanceEnvironment } from "./disposable-acceptance-server";

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type NativeScenarioTransport = {
  origin: string;
  observationPath: string;
  stop: () => Promise<void>;
};

/**
 * TEST-ONLY: put this loopback child in front of the native API reverse while a
 * disposable native acceptance test proves one committed apply loses its ACK.
 * The child revalidates the disposable lease for every request.
 */
export async function startNativeScenarioTransport({
  sessionId,
  environment = process.env,
  upstreamPort = 3100,
}: {
  sessionId: string;
  environment?: NodeJS.ProcessEnv;
  /** Random loopback stubs are permitted only to isolated Node tests. */
  upstreamPort?: number;
}): Promise<NativeScenarioTransport> {
  requireDisposableAcceptanceEnvironment(environment);
  if (environment.E2E_ACCEPTANCE_NATIVE !== "1")
    throw new Error("Native scenario transport requires the disposable native acceptance runner.");
  if (!SESSION_ID.test(sessionId))
    throw new Error("Native scenario transport session identity is invalid.");
  if (
    !Number.isInteger(upstreamPort) ||
    upstreamPort < 1 ||
    upstreamPort > 65535 ||
    (upstreamPort !== 3100 && environment.NODE_ENV !== "test")
  )
    throw new Error("Native scenario transport only permits the runner API loopback.");

  const artifacts = environment.E2E_ACCEPTANCE_ARTIFACTS;
  if (!artifacts || resolve(artifacts) !== artifacts)
    throw new Error("Native scenario transport requires runner-owned private artifacts.");
  const artifactStatus = lstatSync(artifacts);
  if (
    !artifactStatus.isDirectory() ||
    artifactStatus.isSymbolicLink() ||
    (Number(artifactStatus.mode) & 0o777) !== 0o700 ||
    (typeof process.getuid === "function" && artifactStatus.uid !== process.getuid())
  )
    throw new Error("Native scenario transport artifacts are not private.");

  const observationPath = resolve(
    artifacts,
    `native-scenario-transport-${process.pid}-${randomUUID()}.json`,
  );
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve(import.meta.dirname, "native-scenario-transport-child.ts"),
      sessionId,
      observationPath,
      String(upstreamPort),
    ],
    { env: environment, stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  const ready = await waitForReady(child);
  return {
    origin: `http://127.0.0.1:${ready.port}`,
    observationPath,
    stop: () => stopChild(child),
  };
}

async function waitForReady(child: ChildProcess): Promise<{ port: number }> {
  const result = await Promise.race([
    once(child, "message").then(([message]) => message),
    once(child, "exit").then(() => ({ error: true })),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout({ error: true }), 10_000)),
  ]);
  if (
    !result ||
    typeof result !== "object" ||
    !("port" in result) ||
    !Number.isInteger(result.port) ||
    result.port < 1
  ) {
    child.kill("SIGTERM");
    throw new Error("Native scenario transport did not become ready.");
  }
  return { port: result.port };
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}
