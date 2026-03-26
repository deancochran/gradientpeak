import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type LaneManifest = Record<
  string,
  {
    description: string;
    targets: string[];
  }
>;

const args = process.argv.slice(2);
const laneName = args[0];

if (!laneName || laneName === "--list") {
  const manifest = readManifest();
  console.log("Available Maestro lanes:\n");
  for (const [name, lane] of Object.entries(manifest)) {
    console.log(`- ${name}: ${lane.description}`);
  }
  process.exit(laneName ? 0 : 1);
}

const passthroughArgs = args.slice(1).filter((arg) => arg !== "--");
const manifest = readManifest();
const lane = manifest[laneName];

if (!lane) {
  console.error(`Unknown Maestro lane: ${laneName}`);
  console.error("Run `pnpm --filter mobile test:e2e:lane -- --list` to inspect available lanes.");
  process.exit(1);
}

console.log(`[maestro:lane] ${laneName} - ${lane.description}`);

const result = spawnSync(
  "node",
  [
    "--experimental-strip-types",
    "./scripts/run-maestro-flows.mts",
    ...lane.targets,
    ...passthroughArgs,
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);

function readManifest(): LaneManifest {
  const manifestPath = path.resolve(process.cwd(), ".maestro/lanes.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as LaneManifest;
}
