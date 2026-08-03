import { describe, expect, it } from "vitest";

import { buildPerformanceModelSnapshotFixture } from "../../testing/performance-model";
import { athletePerformanceOverviewSchema, projectAthletePerformanceOverview } from "../overview";

const asOf = "2026-07-31T12:00:00.000Z";

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
}

describe("athlete performance overview", () => {
  it("ships only athlete-safe display facts for bike, run, and swim", () => {
    const overview = projectAthletePerformanceOverview(
      buildPerformanceModelSnapshotFixture({ asOf, athleteId: "athlete-1" }),
    );

    expect(Object.keys(overview)).toEqual(["bike", "run", "swim"]);
    expect(overview.bike.planningThresholdPower).toEqual({
      status: "available",
      value: "247 W",
      confidence: "high",
      freshness: "current",
      trainingImpact: "Sets cycling power zones and cycling power targets.",
      action: null,
    });
    expect(overview.run.planningThresholdPace).toEqual({
      status: "unavailable",
      value: null,
      confidence: "unavailable",
      freshness: "unavailable",
      trainingImpact: "Training targets stay unchanged.",
      action: "Record more activity data.",
    });
    expect(overview.swim.cssPace.action).toBeNull();

    const forbiddenKeys = new Set([
      "activityId",
      "asOf",
      "athleteId",
      "calculationIdentity",
      "calculationVersion",
      "capabilities",
      "contractVersion",
      "evidenceCoverage",
      "evidenceSummary",
      "method",
      "other",
      "policyVersion",
      "provenance",
      "reasons",
      "sourceActivityId",
      "sourceEvidenceId",
      "sourceEvidenceIds",
      "strength",
      "trainingLevels",
    ]);
    expect(allKeys(overview).filter((key) => forbiddenKeys.has(key))).toEqual([]);
    expect(JSON.stringify(overview)).not.toMatch(/progressive|max-HR|400 m|200 m|protocol/i);
  });

  it("preserves a current partial value while keeping targets unchanged", () => {
    const snapshot = buildPerformanceModelSnapshotFixture({ asOf });
    const source = snapshot.categories.bike.parameters.fiveSecondPower;
    if (source.status === "unavailable") throw new Error("Expected fixture cycling power");
    snapshot.categories.bike.parameters.fiveSecondPower = {
      ...source,
      status: "partial",
      confidence: "low",
      reasons: ["partial_source_evidence"],
      evidenceCoverage: {
        ...source.evidenceCoverage,
        state: "partial",
        partialSourcePointCount: Math.max(1, source.evidenceCoverage.partialSourcePointCount),
      },
    };

    expect(projectAthletePerformanceOverview(snapshot).bike.fiveSecondPower).toEqual({
      status: "partial",
      value: "1,200 W",
      confidence: "low",
      freshness: "current",
      trainingImpact: "Training targets stay unchanged.",
      action: "Record more activity data.",
    });
  });

  it("downgrades an expired value instead of presenting it as usable", () => {
    const snapshot = buildPerformanceModelSnapshotFixture({ asOf });
    const source = snapshot.categories.bike.parameters.planningThresholdPower;
    if (source.status === "unavailable") throw new Error("Expected fixture cycling threshold");
    snapshot.categories.bike.parameters.planningThresholdPower = {
      ...source,
      expiresAt: "2026-07-30T12:00:00.000Z",
    };

    expect(projectAthletePerformanceOverview(snapshot).bike.planningThresholdPower).toEqual({
      status: "unavailable",
      value: null,
      confidence: "unavailable",
      freshness: "stale",
      trainingImpact: "Training targets stay unchanged.",
      action: "Record more recent activity data.",
    });
  });

  it("rejects extra internal fields at the overview boundary", () => {
    const overview = projectAthletePerformanceOverview(
      buildPerformanceModelSnapshotFixture({ asOf }),
    );
    const invalid = {
      ...overview,
      bike: {
        ...overview.bike,
        planningThresholdPower: {
          ...overview.bike.planningThresholdPower,
          sourceEvidenceIds: ["internal-evidence"],
        },
      },
    };

    expect(athletePerformanceOverviewSchema.safeParse(invalid).success).toBe(false);
  });
});
