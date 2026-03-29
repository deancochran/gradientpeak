import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const targets = [".maestro/artifacts", ".maestro/cache", ".maestro/home", ".maestro/utils"];

const removeEmulatorLog = process.argv.includes("--emulator-log");

for (const relativeTarget of targets) {
  const absoluteTarget = path.resolve(cwd, relativeTarget);
  if (!existsSync(absoluteTarget)) {
    continue;
  }

  rmSync(absoluteTarget, { force: true, recursive: true });
  console.log(`[maestro:clean] removed ${relativeTarget}`);
}

if (removeEmulatorLog) {
  const emulatorLogPath = path.resolve(cwd, ".maestro/emulator.log");
  if (existsSync(emulatorLogPath)) {
    rmSync(emulatorLogPath, { force: true });
    console.log("[maestro:clean] removed .maestro/emulator.log");
  }
}
