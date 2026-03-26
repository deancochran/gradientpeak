import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractSelectors } from "../src/testing/selectors.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentsRoot = path.resolve(__dirname, "../src/components");
const outputPath = path.resolve(__dirname, "../src/testing/selectors.generated.json");

async function collectSelectorManifest() {
  const componentEntries = await readdir(componentsRoot, { withFileTypes: true });
  const manifestEntries = await Promise.all(
    componentEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fixturePath = path.resolve(componentsRoot, entry.name, "fixtures.ts");

        try {
          const fixtureModule = (await import(fixturePath)) as Record<string, unknown>;
          const fixtureEntries = Object.entries(fixtureModule).filter(([key]) =>
            key.endsWith("Fixtures"),
          );

          if (fixtureEntries.length === 0) {
            return undefined;
          }

          const extracted = extractSelectors(
            fixtureEntries.length === 1
              ? fixtureEntries[0]?.[1]
              : Object.fromEntries(fixtureEntries),
          );

          return extracted === undefined ? undefined : ([entry.name, extracted] as const);
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === "ERR_MODULE_NOT_FOUND") {
            return undefined;
          }

          throw error;
        }
      }),
  );

  return Object.fromEntries(
    manifestEntries.filter(
      (entry): entry is readonly [string, import("../src/testing/selectors.ts").JsonLike] =>
        entry !== undefined,
    ),
  );
}

const selectorManifest = await collectSelectorManifest();

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(selectorManifest, null, 2)}\n`, "utf8");

console.log(`Wrote selector manifest to ${outputPath}`);
