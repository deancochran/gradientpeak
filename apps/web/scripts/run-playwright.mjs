import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isolationModes = new Set(["auto", "off", "on"]);

export function getDeviceIsolationMode(value = process.env.PLAYWRIGHT_E2E_DEVICE_ISOLATION) {
  const mode = value?.toLowerCase() ?? "auto";
  if (!isolationModes.has(mode)) {
    throw new Error("PLAYWRIGHT_E2E_DEVICE_ISOLATION must be one of: auto, on, off.");
  }
  return mode;
}

export function hasNvidiaDevices(readDevEntries = () => readdirSync("/dev")) {
  try {
    return readDevEntries().some((entry) => entry.startsWith("nvidia"));
  } catch {
    return false;
  }
}

export function canRunBwrap(run = spawnSync) {
  const result = run("bwrap", ["--version"], { stdio: "ignore" });
  return result.status === 0 && !result.error;
}

export function shouldIsolateGpu({ mode, platform, bwrapAvailable, nvidiaDevicesPresent } = {}) {
  const resolvedMode = mode ?? getDeviceIsolationMode();
  const resolvedPlatform = platform ?? process.platform;
  if (resolvedMode === "off" || resolvedPlatform !== "linux") return false;
  if (!(bwrapAvailable ?? canRunBwrap())) return false;
  return resolvedMode === "on" || (nvidiaDevicesPresent ?? hasNvidiaDevices());
}

export function getPlaywrightCommand(playwrightArgs, isolateGpu) {
  const command = ["pnpm", "exec", "playwright", "test", ...playwrightArgs];
  return isolateGpu
    ? {
        command: "bwrap",
        args: ["--bind", "/", "/", "--dev", "/dev", "--tmpfs", "/dev/shm", ...command],
      }
    : { command: command[0], args: command.slice(1) };
}

export function normalizePlaywrightArgs(playwrightArgs) {
  return playwrightArgs[0] === "--" ? playwrightArgs.slice(1) : playwrightArgs;
}

export function runPlaywright(playwrightArgs) {
  const isolateGpu = shouldIsolateGpu();
  const { command, args } = getPlaywrightCommand(
    normalizePlaywrightArgs(playwrightArgs),
    isolateGpu,
  );
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runPlaywright(process.argv.slice(2));
}
