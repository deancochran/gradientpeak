import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assembleAthleteState,
  athleteStateVectorSchema,
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

  it("intentionally exports planning context and ephemeral athlete state", () => {
    expect(requestScopedAthletePlanningContextSchema).toBeDefined();
    expect(athleteStateVectorSchema).toBeDefined();
    expect(assembleAthleteState).toBeTypeOf("function");
  });

  it("exports canonical threshold, swim pace, and CP/W′ capability vocabulary", () => {
    expect(metricCatalog.threshold_pace_seconds_per_km.canonicalUnit).toBe("seconds_per_km");
    expect(metricCatalog.css_seconds_per_100m.canonicalUnit).toBe("seconds_per_100m");
    expect(effortCurveUnitSchema.options).toContain("seconds_per_100m");
    expect(calculateCriticalPowerCapability).toBeTypeOf("function");
  });
});
