import process from "node:process";

import { normalizeComponentNames, splitArgs, syncRegistryMirrors } from "./registry-cli-utils.mjs";
import { nativeRegistryComponents } from "./registry-component-catalog.mjs";

const { components, flags } = splitArgs(process.argv.slice(2));
const normalizedComponents = normalizeComponentNames(components, [
  "@rnr-nativewind/",
  "@react-native-reusables/",
]);

if (normalizedComponents.length === 0 && !flags.includes("--all")) {
  console.error("Usage: pnpm add:reusables <component...> [--flags]");
  process.exit(1);
}

const requestedComponents = flags.includes("--all")
  ? nativeRegistryComponents
  : normalizedComponents;

if (flags.some((flag) => !["--all", "--overwrite", "--yes"].includes(flag))) {
  console.warn(`Ignoring unsupported reusables mirror flags: ${flags.join(" ")}`);
}

await syncRegistryMirrors({
  components: requestedComponents,
  platform: "native",
  registryPrefix: "@rnr-nativewind/",
});
