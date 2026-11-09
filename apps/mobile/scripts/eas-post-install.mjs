import { mkdir, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

if (process.env.EAS_BUILD_PLATFORM !== "ios") {
  process.exit(0);
}

const home = process.env.HOME;
if (!home) {
  throw new Error("EAS_BUILD_PLATFORM is ios but HOME is unavailable");
}

function resolvePosthogCli() {
  let directory = process.cwd();

  while (true) {
    const require = createRequire(join(directory, "package.json"));

    try {
      return require.resolve("@posthog/cli/run-posthog-cli.js");
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error("Unable to resolve the pinned @posthog/cli package");
      }
      directory = parent;
    }
  }
}

const posthogCli = resolvePosthogCli();
const destination = join(home, ".posthog", "posthog-cli");

await mkdir(dirname(destination), { recursive: true });
await rm(destination, { force: true });
await symlink(posthogCli, destination);

console.log("Configured PostHog CLI for the iOS Xcode build phase.");
