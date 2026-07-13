import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHmsToSeconds as parseCoreHms } from "@repo/core/utils/fitness-inputs";
import { parseHmsToSeconds as parseUiHms } from "@repo/ui/lib/fitness-inputs";
import { describe, expect, it } from "vitest";

describe("fitness input web exports", () => {
  it("keeps the public UI subpath mapped to the framework-free core implementation", () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };

    expect(manifest.exports["./lib/fitness-inputs"]).toBe("./src/lib/fitness-inputs.ts");
    expect(parseUiHms).toBe(parseCoreHms);
    expect(parseUiHms("1:02:03")).toBe(3723);
  });
});
