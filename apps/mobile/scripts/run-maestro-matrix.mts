import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type ActorDefinition = {
  device?: string;
  env?: Record<string, string>;
  envFile?: string | string[];
};

type StepActor = {
  actor: string;
  flows?: string[];
  lane?: string;
  args?: string[];
  env?: Record<string, string>;
  envFile?: string | string[];
};

type MatrixManifest = {
  description?: string;
  defaults?: {
    args?: string[];
    env?: Record<string, string>;
    envFile?: string | string[];
  };
  actors: Record<string, ActorDefinition>;
  steps: Array<{
    name: string;
    mode?: "serial" | "parallel";
    actors: StepActor[];
  }>;
};

const args = process.argv.slice(2);
const matrixPathArg = args[0];

if (!matrixPathArg || matrixPathArg === "--help") {
  console.log("Usage: pnpm --filter mobile test:e2e:matrix <matrix.json> [-- maestro args]");
  process.exit(matrixPathArg ? 0 : 1);
}

const dividerIndex = args.indexOf("--");
const passthroughArgs = dividerIndex >= 0 ? args.slice(dividerIndex + 1) : args.slice(1);
const matrixPath = path.resolve(process.cwd(), matrixPathArg);

if (!existsSync(matrixPath)) {
  console.error(`Maestro matrix not found: ${matrixPath}`);
  process.exit(1);
}

const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as MatrixManifest;

if (matrix.description) {
  console.log(`[maestro:matrix] ${matrix.description}`);
}

for (const step of matrix.steps) {
  console.log(`\n[maestro:matrix] step ${step.name} (${step.mode ?? "serial"})`);
  if ((step.mode ?? "serial") === "parallel") {
    await runParallelStep(step.actors, matrix, passthroughArgs);
  } else {
    for (const actorStep of step.actors) {
      await runActorStep(actorStep, matrix, passthroughArgs);
    }
  }
}

async function runParallelStep(
  stepActors: StepActor[],
  matrixManifest: MatrixManifest,
  passthrough: string[],
) {
  const children = stepActors.map((actorStep) =>
    startActorStep(actorStep, matrixManifest, passthrough),
  );
  const results = await Promise.all(children.map(waitForChild));
  const failed = results.find((code) => code !== 0);
  if (failed !== undefined) {
    process.exit(failed);
  }
}

async function runActorStep(
  actorStep: StepActor,
  matrixManifest: MatrixManifest,
  passthrough: string[],
) {
  const child = startActorStep(actorStep, matrixManifest, passthrough);
  const exitCode = await waitForChild(child);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function startActorStep(
  actorStep: StepActor,
  matrixManifest: MatrixManifest,
  passthrough: string[],
) {
  const actor = matrixManifest.actors[actorStep.actor];
  if (!actor) {
    throw new Error(`Unknown matrix actor: ${actorStep.actor}`);
  }

  const env = {
    ...process.env,
    ...matrixManifest.defaults?.env,
    ...actor.env,
    ...actorStep.env,
  };
  const args = [
    ...toEnvFileArgs(matrixManifest.defaults?.envFile),
    ...toEnvFileArgs(actor.envFile),
    ...toEnvFileArgs(actorStep.envFile),
    ...(matrixManifest.defaults?.args ?? []),
    ...(actorStep.args ?? []),
    ...passthrough,
  ];

  if (actor.device && !args.includes("--device") && !args.includes("--udid")) {
    args.push("--device", actor.device);
  }

  const runnerScript = actorStep.lane
    ? "./scripts/run-maestro-lane.mts"
    : "./scripts/run-maestro-flows.mts";
  const runnerArgs = actorStep.lane ? [actorStep.lane] : (actorStep.flows ?? []);

  if (runnerArgs.length === 0) {
    throw new Error(`Matrix actor step must declare flows or lane: ${actorStep.actor}`);
  }

  console.log(
    `[maestro:matrix] actor=${actorStep.actor} device=${actor.device ?? "default"} target=${runnerArgs.join(",")}`,
  );

  return spawn("node", ["--experimental-strip-types", runnerScript, ...runnerArgs, ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
}

function toEnvFileArgs(value?: string | string[]) {
  const files = Array.isArray(value) ? value : value ? [value] : [];
  return files.flatMap((file) => ["--env-file", file]);
}

function waitForChild(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
