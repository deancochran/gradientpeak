import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { extractSelectors } from "../src/testing/selectors";
import { uiPreviewContract, uiPreviewScenarioSelectors } from "../src/testing/ui-preview/contract";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentsRoot = resolve(packageRoot, "src/components");
const selectorsPath = resolve(packageRoot, "src/testing/selectors.generated.json");
const previewManifestPath = resolve(packageRoot, "src/testing/ui-preview/manifest.generated.json");

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function generateSelectors() {
  const output: Record<string, unknown> = {};
  for (const component of readdirSync(componentsRoot).sort()) {
    const fixturePath = resolve(componentsRoot, component, "fixtures.ts");
    if (!existsSync(fixturePath)) continue;
    const module = await import(pathToFileURL(fixturePath).href);
    const fixture = Object.entries(module).find(([name]) => name.endsWith("Fixtures"))?.[1];
    const selectors = extractSelectors(fixture);
    if (selectors !== undefined) output[component] = selectors;
  }
  return output;
}

function generatePreviewManifest() {
  return {
    description: uiPreviewContract.description,
    rootTestId: uiPreviewContract.rootTestId,
    scenarios: Object.entries(uiPreviewContract.scenarios).map(([key, scenario]) => ({
      ...scenario,
      key,
      selectors: uiPreviewScenarioSelectors[key as keyof typeof uiPreviewScenarioSelectors],
    })),
  };
}

const outputs = new Map([
  [selectorsPath, stableJson(await generateSelectors())],
  [previewManifestPath, stableJson(generatePreviewManifest())],
]);
const checkOnly = process.argv.includes("--check");
let stale = false;

for (const [path, expected] of outputs) {
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
      console.error(`Stale generated UI testing artifact: ${path.slice(packageRoot.length + 1)}`);
      stale = true;
    }
  } else {
    writeFileSync(path, expected);
  }
}

if (stale) process.exitCode = 1;
