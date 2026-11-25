import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
  trace: () => Promise<NativeGoalTransportTrace[]>;
  stop: () => Promise<void>;
};

export type NativeGoalTransportTrace = {
  method: string;
  procedures: Array<
    | "athleteIntelligence.getGoalAssessment"
    | "athleteIntelligence.getGoalProgress"
    | "athleteIntelligence.getThresholdOverview"
  >;
  batchSize: number;
  hasProgress: boolean;
  hasThreshold: boolean;
  targetGoalMatched: boolean;
  requestOrder: number;
  responseOrder?: number;
  status?: number;
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
  if (!ready || typeof ready !== "object" || !("port" in ready) || !Number.isInteger(ready.port)) {
    await stopNativeScenarioTransportChild(child);
    throw new Error("Native goal transport did not become ready.");
  }
  let commandTail = Promise.resolve();
  const command = <T extends "allow" | "observations" | "trace">(type: T) => {
    const run = async () => {
      try {
        requireNativeScenarioTransportGuard({ environment, sessionId: goalId, upstreamPort });
        const received = message(child, type);
        child.send?.({ type });
        const result = await received;
        if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true)
          throw new Error("Native goal transport control failed.");
        return result;
      } catch (error) {
        await stopNativeScenarioTransportChild(child);
        throw error;
      }
    };
    const result = commandTail.then(run, run);
    commandTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    origin: `http://127.0.0.1:${ready.port}`,
    allowProgressReads: async () => void (await command("allow")),
    observations: async () => {
      const result = await command("observations");
      return { blocked: Number(result.blocked), forwarded: Number(result.forwarded) };
    },
    trace: async () => {
      const result = await command("trace");
      return Array.isArray(result.records) ? (result.records as NativeGoalTransportTrace[]) : [];
    },
    stop: () => stopNativeScenarioTransportChild(child),
  };
}

async function message(
  child: ChildProcess,
  expected: string,
): Promise<Record<string, unknown> | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await new Promise<unknown>((resolve) => {
    const finish = (value: unknown) => {
      child.off("message", onMessage);
      child.off("exit", onExit);
      if (timer !== undefined) clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (value: unknown) => finish(value);
    const onExit = () => finish(undefined);
    child.once("message", onMessage);
    child.once("exit", onExit);
    timer = setTimeout(() => finish(undefined), 10_000);
  });
  return result && typeof result === "object" && "type" in result && result.type === expected
    ? (result as Record<string, unknown>)
    : undefined;
}
