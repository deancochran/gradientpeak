import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as coreRoot from "@repo/core";
import * as activityFileContracts from "@repo/core/activity-files";
import { parseFitFileWithSDK } from "@repo/core/activity-files/fit-parser";
import { parseActivityFile } from "@repo/core/activity-files/parser";
import { describe, expect, it } from "vitest";

const PACKAGE_MANIFEST_PATH = resolve(__dirname, "../../package.json");

describe("activity-file package exports", () => {
  it("keeps runtime-heavy parsers behind explicit entrypoints", () => {
    expect(parseActivityFile).toBeTypeOf("function");
    expect(parseFitFileWithSDK).toBeTypeOf("function");
    expect(activityFileContracts).not.toHaveProperty("parseActivityFile");
    expect(activityFileContracts).not.toHaveProperty("parseFitFileWithSDK");
    expect(coreRoot).not.toHaveProperty("parseActivityFile");
    expect(coreRoot).not.toHaveProperty("parseFitFileWithSDK");
  });

  it("declares only intentional activity-file subpaths", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST_PATH, "utf8")) as {
      exports: Record<string, string>;
    };

    expect(manifest.exports["./activity-files"]).toBe("./activity-files/index.ts");
    expect(manifest.exports["./activity-files/parser"]).toBe("./activity-files/parser.ts");
    expect(manifest.exports["./activity-files/fit-parser"]).toBe("./activity-files/fit-parser.ts");
    expect(Object.keys(manifest.exports)).not.toContain("./activity-files/*");
  });
});
