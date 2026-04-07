import process from "node:process";

import {
  ensurePlatformEntry,
  normalizeComponentNames,
  splitArgs,
  syncRegistryMirrors,
} from "./registry-cli-utils.mjs";
import { webRegistryComponents } from "./registry-component-catalog.mjs";

const { components, flags } = splitArgs(process.argv.slice(2));
const normalizedComponents = normalizeComponentNames(components, ["@shadcn/"]);

if (normalizedComponents.length === 0 && !flags.includes("--all")) {
  console.error("Usage: pnpm add:shadcn <component...> [--flags]");
  process.exit(1);
}

const requestedComponents = flags.includes("--all") ? webRegistryComponents : normalizedComponents;

if (flags.some((flag) => !["--all", "--overwrite", "--yes"].includes(flag))) {
  console.warn(`Ignoring unsupported shadcn mirror flags: ${flags.join(" ")}`);
}

await syncRegistryMirrors({
  components: requestedComponents,
  platform: "web",
});
