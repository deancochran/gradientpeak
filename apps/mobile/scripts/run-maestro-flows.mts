import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flagsWithValue = new Set([
  "--config",
  "--debug-output",
  "--format",
  "--output",
  "--platform",
  "--screen-size",
  "--shards",
  "--shard-all",
  "--shard-split",
  "--test-output-dir",
  "--test-suite-name",
  "--udid",
  "--device",
  "--api-key",
  "--api-url",
  "-p",
  "-s",
  "-e",
]);

const passthroughArgs: string[] = [];
const flowTargets: string[] = [];
const passthroughFlags = new Set(args.filter((arg) => arg.startsWith("-")));
const customEnvFiles: string[] = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--") {
    continue;
  }
  if (arg === "--env-file") {
    const nextArg = args[index + 1];
    if (!nextArg) {
      throw new Error("Missing value for --env-file");
    }
    customEnvFiles.push(nextArg);
    index += 1;
    continue;
  }
  if (arg.startsWith("-")) {
    passthroughArgs.push(arg);
    if (flagsWithValue.has(arg)) {
      const nextArg = args[index + 1];
      if (nextArg) {
        passthroughArgs.push(nextArg);
        index += 1;
      }
    }
    continue;
  }

  flowTargets.push(arg);
}

const targets = flowTargets.length > 0 ? flowTargets : [".maestro/flows/main"];
const cwd = process.cwd();
const artifactsRoot = path.resolve(cwd, ".maestro/artifacts");
const debugOutputDir = path.join(artifactsRoot, "debug");
const testOutputDir = path.join(artifactsRoot, "test-output");
const maestroHomeDir = path.resolve(cwd, ".maestro/home");
const maestroCacheDir = path.resolve(cwd, ".maestro/cache");
const baseEnv = loadBaseEnv();

mkdirSync(debugOutputDir, { recursive: true });
mkdirSync(testOutputDir, { recursive: true });
mkdirSync(maestroHomeDir, { recursive: true });
mkdirSync(maestroCacheDir, { recursive: true });

const flowFiles = targets.flatMap((target) => expandFlowTarget(path.resolve(cwd, target)));

if (flowFiles.length === 0) {
  throw new Error(`No Maestro flows found in: ${targets.join(", ")}`);
}

for (const flowFile of flowFiles) {
  const env = { ...baseEnv };
  const relativeFlow = path.relative(cwd, flowFile);
  const flowEnvArgs: string[] = [];
  const commandArgs = ["test", ...passthroughArgs];

  if (!passthroughFlags.has("--debug-output")) {
    commandArgs.push("--debug-output", debugOutputDir);
  }

  if (!passthroughFlags.has("--test-output-dir")) {
    commandArgs.push("--test-output-dir", testOutputDir);
  }

  if (needsUniqueSignupEmail(flowFile) && !env.SIGNUP_EMAIL) {
    env.SIGNUP_EMAIL = buildUniqueSignupEmail(relativeFlow);
  }

  if (needsUniqueSignupEmail(flowFile) && !env.SIGNUP_PASSWORD) {
    env.SIGNUP_PASSWORD = "Password123";
  }

  if (needsUniqueSignupEmail(flowFile)) {
    flowEnvArgs.push("-e", `SIGNUP_EMAIL=${env.SIGNUP_EMAIL}`);
    flowEnvArgs.push("-e", `SIGNUP_PASSWORD=${env.SIGNUP_PASSWORD}`);
    console.log(`[maestro] ${relativeFlow} SIGNUP_EMAIL=${env.SIGNUP_EMAIL}`);
  } else {
    console.log(`[maestro] ${relativeFlow}`);
  }

  env.HOME = maestroHomeDir;
  env.XDG_CACHE_HOME = maestroCacheDir;

  const result = runMaestroWithRetries(
    [...commandArgs, ...flowEnvArgs, flowFile],
    env,
    relativeFlow,
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runMaestroWithRetries(commandArgs: string[], env: NodeJS.ProcessEnv, label: string) {
  const retryCount = Number.parseInt(env.MAESTRO_DRIVER_RETRIES ?? "2", 10);
  const device = getFlagValue(commandArgs, "--device") ?? env.ANDROID_SERIAL;

  for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
    if (device) {
      prepareAndroidDevice(device, env);
    }

    const result = spawnSync("maestro", commandArgs, {
      cwd,
      env,
      encoding: "utf8",
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (!shouldRetryAttachFailure(result, attempt, retryCount + 1)) {
      return result;
    }

    console.warn(
      `[maestro] attach timeout for ${label}; retrying ${attempt}/${retryCount + 1} after adb cleanup`,
    );
    if (device) {
      cleanupAndroidForwarding(device, env);
    }
  }

  return { status: 1, stdout: "", stderr: "" };
}

function shouldRetryAttachFailure(
  result: { status: number | null; stderr?: string | Buffer | null },
  attempt: number,
  maxAttempts: number,
) {
  if ((result.status ?? 1) === 0 || attempt >= maxAttempts) {
    return false;
  }

  const stderr = typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? "");
  return (
    stderr.includes("dadb.forwarding.TcpForwarder.waitFor") ||
    stderr.includes("TimeoutException") ||
    stderr.includes("DEADLINE_EXCEEDED") ||
    stderr.includes("Command failed (tcp:7001): closed")
  );
}

function prepareAndroidDevice(device: string, env: NodeJS.ProcessEnv) {
  spawnSync("adb", ["-s", device, "wait-for-device"], { cwd, env, stdio: "ignore" });
  spawnSync("adb", ["-s", device, "reverse", "tcp:8081", "tcp:8081"], {
    cwd,
    env,
    stdio: "ignore",
  });
}

function cleanupAndroidForwarding(device: string, env: NodeJS.ProcessEnv) {
  spawnSync("adb", ["-s", device, "reverse", "--remove", "tcp:8081"], {
    cwd,
    env,
    stdio: "ignore",
  });
}

function loadBaseEnv() {
  const loadedFiles = resolveEnvFiles();
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env };

  for (const envFile of loadedFiles) {
    const parsed = parseEnvFile(envFile);
    Object.assign(mergedEnv, parsed);
  }

  return mergedEnv;
}

function resolveEnvFiles() {
  const files = customEnvFiles.length > 0 ? customEnvFiles : [".maestro/fixtures.env"];
  return files.map((file) => path.resolve(cwd, file)).filter((file) => existsSync(file));
}

function parseEnvFile(filePath: string) {
  const parsed: Record<string, string> = {};
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    parsed[key] = expandEnvReferences(value, { ...process.env, ...parsed });
  }

  return parsed;
}

function expandEnvReferences(value: string, env: NodeJS.ProcessEnv) {
  return value.replace(/\$(?:\{([A-Z0-9_]+)\}|([A-Z0-9_]+))/gi, (_match, braced, plain) => {
    const key = braced ?? plain;
    return env[key] ?? "";
  });
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getFlagValue(argsToSearch: string[], flag: string) {
  const index = argsToSearch.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argsToSearch[index + 1];
}

function expandFlowTarget(targetPath: string): string[] {
  const stats = statSync(targetPath, { throwIfNoEntry: false });
  if (!stats) {
    throw new Error(`Flow target not found: ${targetPath}`);
  }

  if (stats.isDirectory()) {
    return readdirSync(targetPath)
      .sort((left, right) => left.localeCompare(right))
      .flatMap((entry) => expandFlowTarget(path.join(targetPath, entry)));
  }

  if (targetPath.endsWith(".yaml") || targetPath.endsWith(".yml")) {
    return [targetPath];
  }

  return [];
}

function needsUniqueSignupEmail(flowFile: string) {
  return ["sign_up_to_verify.yaml", "verify_resend.yaml"].includes(path.basename(flowFile));
}

function buildUniqueSignupEmail(flowName: string) {
  const prefix = sanitizeEmailPart(
    process.env.MAESTRO_SIGNUP_EMAIL_PREFIX ?? "gradientpeak.maestro",
  );
  const domain = process.env.MAESTRO_SIGNUP_EMAIL_DOMAIN ?? "example.com";
  const label = sanitizeEmailPart(path.basename(flowName, path.extname(flowName)));
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}+${label}-${uniqueSuffix}@${domain}`;
}

function sanitizeEmailPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "signup"
  );
}
