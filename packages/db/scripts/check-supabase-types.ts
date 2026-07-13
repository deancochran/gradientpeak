import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const functionsRoot = resolve(packageRoot, "supabase/functions");

function containsFunctionSource(directory: string): boolean {
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? containsFunctionSource(resolve(directory, entry.name))
      : /\.[jt]sx?$/.test(entry.name),
  );
}

if (containsFunctionSource(functionsRoot)) {
  execFileSync("pnpm", ["exec", "tsc", "--noEmit", "-p", "supabase/tsconfig.json"], {
    cwd: packageRoot,
    stdio: "inherit",
  });
} else {
  console.log(
    "Supabase function type coverage: no tracked function source (retired function remains absent).",
  );
}
