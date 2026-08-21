import { describe, expect, it } from "vitest";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import { resolveActivityPlanSessionFlow } from "../session-flow-personalization";

const asOf = "2026-08-19T12:00:00.000Z";
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function structure(targets: Array<{ type: string; intensity: number }>) {
  return {
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: id(1),
        role: "activity",
        name: "Ride",
        intervals: [
          {
            id: id(2),
            name: "Work",
            repetitions: 1,
            steps: [
              {
                id: id(3),
                name: "Tempo",
                duration: { type: "time", seconds: 600 },
                targets,
              },
            ],
          },
        ],
      },
    ],
  };
}

function facts() {
  return buildPerformanceTargetFactsFixture({
    asOf,
    athleteId: "viewer-1",
    bikeThresholdWatts: 300,
    lthrBpm: { bike: 180 },
  });
}

describe("resolveActivityPlanSessionFlow", () => {
  it("defaults an all-convertible flow to a complete physical structure when requested", () => {
    const result = resolveActivityPlanSessionFlow({
      structure: structure([
        { type: "%FTP", intensity: 80 },
        { type: "%ThresholdHR", intensity: 90 },
      ]),
      performanceTargets: facts(),
      personalize: true,
    });

    expect(result.eligibility).toEqual({ eligible: true, blocker: null, reason: null });
    expect(result.mode).toBe("personalized");
    expect(result.structure?.segments[0]).toMatchObject({
      intervals: [
        {
          steps: [
            {
              targets: [
                { type: "watts", intensity: 240 },
                { type: "bpm", intensity: 162 },
              ],
            },
          ],
        },
      ],
    });
    expect(result.targetResolutions[0]).toMatchObject({
      authoredTarget: { type: "%FTP", intensity: 80 },
      physicalTarget: { type: "watts", intensity: 240 },
      presentation: { label: "240 W (80% FTP)", sourceLabel: "80% FTP" },
    });
  });

  it("keeps RPE authored and ineligible", () => {
    const result = resolveActivityPlanSessionFlow({
      structure: structure([{ type: "RPE", intensity: 7 }]),
      performanceTargets: facts(),
      personalize: true,
    });

    expect(result.mode).toBe("authored");
    expect(result.eligibility).toMatchObject({ eligible: false, blocker: "abstract_target" });
    expect(result.structure?.segments[0]).toMatchObject({
      intervals: [{ steps: [{ targets: [{ type: "RPE", intensity: 7 }] }] }],
    });
  });

  it.each([
    ["%FTP", "missing_ftp"],
    ["%ThresholdHR", "missing_heart_rate"],
    ["%MaxHR", "missing_heart_rate"],
  ] as const)("blocks %s when its viewer fact is missing", (type, blocker) => {
    const result = resolveActivityPlanSessionFlow({
      structure: structure([{ type, intensity: 80 }]),
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
      personalize: true,
    });

    expect(result.eligibility).toMatchObject({ eligible: false, blocker });
    expect(result.mode).toBe("authored");
  });

  it("counts exact physical targets as eligible without viewer facts", () => {
    const result = resolveActivityPlanSessionFlow({
      structure: structure([
        { type: "watts", intensity: 250 },
        { type: "cadence", intensity: 90 },
      ]),
      personalize: true,
    });

    expect(result.eligibility.eligible).toBe(true);
    expect(result.mode).toBe("personalized");
  });

  it("blocks a mixed flow when even one target cannot be physical", () => {
    const result = resolveActivityPlanSessionFlow({
      structure: structure([
        { type: "watts", intensity: 250 },
        { type: "RPE", intensity: 7 },
      ]),
      performanceTargets: facts(),
      personalize: true,
    });

    expect(result.eligibility).toMatchObject({ eligible: false, blocker: "abstract_target" });
    expect(result.mode).toBe("authored");
  });
});
