import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { closeSync, openSync } from "node:fs";
import { resolve } from "node:path";
import {
  requireNativeScenarioTransportGuard,
  stopNativeScenarioTransportChild,
} from "./native-scenario-transport";

export type NativeGoalTransport = {
  origin: string;
  allowProgressReads: () => Promise<void>;
  observations: () => Promise<{ blocked: number; forwarded: number }>;
  stop: () => Promise<void>;
};

export async function startNativeGoalTransport({
  goalId,
  environment = process.env,
  upstreamPort = 3100,
}: {
  goalId: string;
  environment?: NodeJS.ProcessEnv;
  upstreamPort?: number;
}): Promise<NativeGoalTransport> {
  const { artifacts } = requireNativeScenarioTransportGuard({
    environment,
    sessionId: goalId,
    upstreamPort,
  });
  const observationPath = resolve(
    artifacts,
    `native-goal-transport-${process.pid}-${randomUUID()}.json`,
  );
  closeSync(openSync(observationPath, "wx", 0o600));
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve(import.meta.dirname, "native-goal-transport-child.ts"),
      goalId,
      observationPath,
      String(upstreamPort),
    ],
    { env: environment, stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  const ready = await message(child, "ready");
  if (!ready || typeof ready !== "object" || !("port" in ready) || !Number.isInteger(ready.port))
    throw new Error("Native goal transport did not become ready.");
  const command = async (type: "allow" | "observations") => {
    const received = message(child, type);
    child.send?.({ type });
    const result = await received;
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true)
      throw new Error("Native goal transport control failed.");
    return result;
  };
  return {
    origin: `http://127.0.0.1:${ready.port}`,
    allowProgressReads: async () => void (await command("allow")),
    observations: async () => {
      const result = await command("observations");
      return { blocked: Number(result.blocked), forwarded: Number(result.forwarded) };
    },
    stop: () => stopNativeScenarioTransportChild(child),
  };
}

async function message(
  child: ChildProcess,
  expected: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await Promise.race([
    once(child, "message").then(([value]) => value),
    once(child, "exit").then(() => undefined),
    new Promise<undefined>((done) => setTimeout(done, 10_000)),
  ]);
  return result && typeof result === "object" && "type" in result && result.type === expected
    ? (result as Record<string, unknown>)
    : undefined;
}
