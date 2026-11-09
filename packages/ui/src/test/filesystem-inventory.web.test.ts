import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getPlatformComponentDirectories,
  inventoryProductionTypeScriptFiles,
} from "./filesystem-inventory";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { force: true, recursive: true });
});

function fixture(files: string[]) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ui-filesystem-inventory-"));
  fixtures.push(root);
  for (const file of files) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "");
  }
  return root;
}

describe("filesystem test support", () => {
  it("recursively inventories production TypeScript and excludes test, story, and generated files", () => {
    const root = fixture([
      "Top.tsx",
      "nested/Keep.ts",
      "nested/Keep.test.ts",
      "nested/Keep.stories.tsx",
      "nested/schema.generated.ts",
      "nested/__tests__/Hidden.tsx",
      "nested/generated/Hidden.ts",
    ]);

    expect(inventoryProductionTypeScriptFiles(root)).toEqual(["Top.tsx", "nested/Keep.ts"]);
  });

  it("finds both ts and tsx platform entrypoints", () => {
    const root = fixture([
      "alpha/index.web.ts",
      "beta/index.web.tsx",
      "gamma/index.native.ts",
      "delta/index.native.tsx",
    ]);

    expect(getPlatformComponentDirectories(root, "web")).toEqual(["alpha", "beta"]);
    expect(getPlatformComponentDirectories(root, "native")).toEqual(["delta", "gamma"]);
  });
});
