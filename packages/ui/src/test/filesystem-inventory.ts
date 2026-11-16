import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const EXCLUDED_DIRECTORIES = new Set(["__stories__", "__tests__", "generated"]);
const EXCLUDED_FILE_PATTERN = /\.(?:generated|stories?|spec|test)\.[cm]?[jt]sx?$/;
const TYPESCRIPT_FILE_PATTERN = /\.[cm]?tsx?$/;

export function inventoryProductionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];

  function visit(directory: string, relativeDirectory = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relativePath);
      else if (
        entry.isFile() &&
        TYPESCRIPT_FILE_PATTERN.test(entry.name) &&
        !EXCLUDED_FILE_PATTERN.test(entry.name)
      ) {
        files.push(relativePath);
      }
    }
  }

  visit(root);
  return files.sort();
}

export function getPlatformComponentDirectories(
  componentsRoot: string,
  platform: "native" | "web",
): string[] {
  return readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (entry) =>
        existsSync(path.join(componentsRoot, entry, `index.${platform}.ts`)) ||
        existsSync(path.join(componentsRoot, entry, `index.${platform}.tsx`)),
    )
    .sort();
}
