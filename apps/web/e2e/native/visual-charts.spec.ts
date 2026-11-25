import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";
import { expect, test } from "../fixtures";

const flow = "visual-charts.yaml";
const screenshots = [
  "visual-charts-scenario-comparison",
  "visual-charts-threshold-history",
  "visual-charts-threshold-run-pace",
] as const;

function screenshotPath(root: string, name: string) {
  return join(root, `${name}.png`);
}

function maestroDebugDirectory(testInfo: TestInfo) {
  return testInfo.outputPath("maestro", "visual-charts");
}

function pngDimensions(path: string) {
  const source = readFileSync(path);
  expect(source.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);
  expect(source.toString("ascii", 12, 16)).toBe("IHDR");
  return { height: source.readUInt32BE(20), width: source.readUInt32BE(16) };
}

test("Android renders fixture-only scenario and threshold charts without obscuring the full pace chart", async ({
  e2eIdentity: _e2eIdentity,
}, testInfo) => {
  test.setTimeout(300_000);
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel)
    throw new Error(
      "Native visual-chart proof requires the runner-provided MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL.",
    );

  const debugDirectory = maestroDebugDirectory(testInfo);
  const retainedDirectory = testInfo.outputPath("visual-charts-screenshots");
  mkdirSync(debugDirectory, { recursive: true });
  mkdirSync(retainedDirectory, { recursive: true });
  for (const name of screenshots) {
    rmSync(screenshotPath(debugDirectory, name), { force: true });
    rmSync(screenshotPath(process.cwd(), name), { force: true });
    rmSync(screenshotPath(retainedDirectory, name), { force: true });
  }

  const result = spawnSync(
    "maestro",
    [
      "--udid",
      "emulator-5554",
      "test",
      "--debug-output",
      debugDirectory,
      `../mobile/.maestro/flows/acceptance/${flow}`,
    ],
    { encoding: "utf8", env: process.env, timeout: 180_000 },
  );
  const retained: string[] = [];
  for (const name of screenshots) {
    const destination = screenshotPath(retainedDirectory, name);
    for (const source of [
      screenshotPath(debugDirectory, name),
      screenshotPath(process.cwd(), name),
    ]) {
      if (!existsSync(source)) continue;
      copyFileSync(source, destination);
      retained.push(destination);
      break;
    }
  }
  writeFileSync(
    testInfo.outputPath("maestro-visual-charts.log"),
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    { mode: 0o600 },
  );

  expect(
    result.error,
    "Maestro must execute the fixture-only visual chart walkthrough",
  ).toBeUndefined();
  expect(result.status, "See private Maestro output for the visual chart walkthrough").toBe(0);
  expect(retained).toHaveLength(screenshots.length);
  for (const path of retained) expect(pngDimensions(path)).toEqual({ height: 2400, width: 1080 });
});
