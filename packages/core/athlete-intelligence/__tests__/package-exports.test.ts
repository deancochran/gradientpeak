import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateCriticalPowerCapability,
  effortCurveUnitSchema,
  metricCatalog,
  requestScopedAthletePlanningContextSchema,
} from "@repo/core/athlete-intelligence";
import { describe, expect, it } from "vitest";

const PACKAGE_MANIFEST_PATH = resolve(__dirname, "../../package.json");

describe("athlete intelligence package exports", () => {
  it("exposes only the canonical athlete-intelligence module", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST_PATH, "utf8")) as {
      exports: Record<string, string>;
    };

    expect(manifest.exports["./athlete-intelligence"]).toBe("./athlete-intelligence/index.ts");
    expect(Object.keys(manifest.exports)).not.toContain("./athlete-intelligence/*");
    expect(
      Object.keys(manifest.exports).filter((entry) => entry.startsWith("./athlete-intelligence/")),
    ).toEqual([]);
  });

  it("intentionally exports request-scoped planning context", () => {
    expect(requestScopedAthletePlanningContextSchema).toBeDefined();
  });

  it("exports contextual metrics, swim pace curves, and CP/W′ capability vocabulary", () => {
    expect(metricCatalog.lthr.canonicalUnit).toBe("beats_per_minute");
    expect(effortCurveUnitSchema.options).toContain("seconds_per_100m");
    expect(calculateCriticalPowerCapability).toBeTypeOf("function");
  });
});
