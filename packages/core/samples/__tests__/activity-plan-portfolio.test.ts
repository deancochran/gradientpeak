import { describe, expect, it } from "vitest";
import {
  EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
  EXPANDED_ENDURANCE_BIKE_METADATA,
  EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
  EXPANDED_ENDURANCE_OTHER_METADATA,
  EXPANDED_ENDURANCE_RUN_ACTIVITIES,
  EXPANDED_ENDURANCE_RUN_METADATA,
  EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
  EXPANDED_ENDURANCE_STRENGTH_METADATA,
  EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
  EXPANDED_ENDURANCE_SWIM_METADATA,
  evaluateActivityPlanPortfolio,
  ICONIC_ENDURANCE_ACTIVITIES,
  ICONIC_ENDURANCE_METADATA,
  SYSTEM_TEMPLATES,
} from "..";

const iconicIds = [
  "a4e10000-0001-4000-8001-000000000001",
  "a4e10000-0001-4000-8002-000000000002",
  "a4e10000-0001-4000-8003-000000000003",
  "a4e10000-0001-4000-8004-000000000004",
  "a4e20000-0001-4000-8001-000000000005",
  "a4e20000-0001-4000-8002-000000000006",
  "a4e20000-0001-4000-8003-000000000007",
  "a4e20000-0001-4000-8004-000000000008",
  "a4e30000-0001-4000-8001-000000000009",
  "a4e30000-0001-4000-8002-000000000010",
  "a4e30000-0001-4000-8003-000000000011",
  "a4e30000-0001-4000-8004-000000000012",
  "a4e40000-0001-4000-8001-000000000013",
  "a4e40000-0001-4000-8002-000000000014",
  "a4e40000-0001-4000-8003-000000000015",
  "a4e40000-0001-4000-8004-000000000016",
];

function activityIntervals(plan: (typeof ICONIC_ENDURANCE_ACTIVITIES)[number]) {
  const segment = plan.structure.segments[0];
  if (!segment || segment.role !== "activity") throw new Error("Expected activity segment");
  return segment.intervals;
}

function requiredActivityIntervals(plan: (typeof ICONIC_ENDURANCE_ACTIVITIES)[number] | undefined) {
  if (!plan) throw new Error("Expected iconic endurance plan");
  return activityIntervals(plan);
}

describe("activity-plan portfolio", () => {
  it("registers exactly four four-level iconic endurance families with immutable identities", () => {
    expect(ICONIC_ENDURANCE_ACTIVITIES.map((plan) => plan.id)).toEqual(iconicIds);
    expect(ICONIC_ENDURANCE_METADATA).toHaveLength(16);
    expect([
      ...ICONIC_ENDURANCE_METADATA.reduce((families, entry) => {
        families.set(entry.family, (families.get(entry.family) ?? 0) + 1);
        return families;
      }, new Map<string, number>()).values(),
    ]).toEqual([4, 4, 4, 4]);
    expect(new Set(ICONIC_ENDURANCE_ACTIVITIES.map((plan) => plan.name)).size).toBe(16);
    expect(ICONIC_ENDURANCE_ACTIVITIES.every((plan) => plan.notes?.startsWith("Source:"))).toBe(
      true,
    );
  });

  it("preserves the cited protocol shapes and guardrails", () => {
    const classic4x4 = ICONIC_ENDURANCE_ACTIVITIES.find(
      (plan) => plan.name === "Norwegian 4×4 Run — Development",
    );
    expect(
      requiredActivityIntervals(classic4x4).find(
        (interval) => interval.name === "4×4 Aerobic Power",
      ),
    ).toMatchObject({
      repetitions: 4,
      steps: [
        { duration: { seconds: 240, type: "time" }, targets: [{ intensity: 92, type: "%MaxHR" }] },
        { duration: { seconds: 180, type: "time" }, targets: [{ intensity: 70, type: "%MaxHR" }] },
      ],
    });
    expect(
      requiredActivityIntervals(classic4x4).find(
        (interval) => interval.name === "4×4 Aerobic Power",
      )?.steps[0]?.notes,
    ).toContain("90–95% HRmax");
    expect(SYSTEM_TEMPLATES.some((plan) => plan.description?.includes("4x8min at 95% FTP"))).toBe(
      true,
    );

    const threshold25x400 = ICONIC_ENDURANCE_ACTIVITIES.find(
      (plan) => plan.name === "Norwegian Controlled Threshold Run — Race",
    );
    expect(
      requiredActivityIntervals(threshold25x400).find(
        (interval) => interval.name === "Controlled Threshold Repeats",
      ),
    ).toMatchObject({
      repetitions: 25,
      steps: [
        { duration: { meters: 400, type: "distance" }, targets: [{ intensity: 7, type: "RPE" }] },
        { duration: { seconds: 30, type: "time" }, name: "Float Recovery" },
      ],
    });
    expect(threshold25x400?.description).toContain(
      "Same-day pairing is an advanced coaching decision",
    );

    const ronnestad = ICONIC_ENDURANCE_ACTIVITIES.find(
      (plan) => plan.name === "Rønnestad 30/15 Cycling — Advanced",
    );
    expect(
      requiredActivityIntervals(ronnestad).filter((interval) =>
        interval.name.startsWith("30/15 Block"),
      ),
    ).toHaveLength(3);
    expect(
      requiredActivityIntervals(ronnestad).find((interval) => interval.name === "30/15 Block 1"),
    ).toMatchObject({
      repetitions: 10,
      steps: [
        { duration: { seconds: 30, type: "time" }, name: "30-second Work" },
        { duration: { seconds: 15, type: "time" }, name: "15-second Recovery" },
      ],
    });
    expect(
      requiredActivityIntervals(ronnestad).some(
        (interval) => interval.name === "Between-set Recovery",
      ),
    ).toBe(true);

    const css = ICONIC_ENDURANCE_ACTIVITIES.find(
      (plan) => plan.name === "Critical Swim Speed (CSS) — Development",
    );
    expect(
      requiredActivityIntervals(css).find((interval) => interval.name === "CSS Repeats"),
    ).toMatchObject({
      repetitions: 8,
      steps: [
        { duration: { meters: 100, type: "distance" }, targets: [{ intensity: 7, type: "RPE" }] },
        { duration: { seconds: 15, type: "time" }, name: "Short Rest" },
      ],
    });
  });

  it("keeps the 198-plan portfolio valid, balanced, and progression-complete", () => {
    const report = evaluateActivityPlanPortfolio(SYSTEM_TEMPLATES, [
      ...EXPANDED_ENDURANCE_BIKE_METADATA,
      ...EXPANDED_ENDURANCE_RUN_METADATA,
      ...EXPANDED_ENDURANCE_SWIM_METADATA,
      ...EXPANDED_ENDURANCE_STRENGTH_METADATA,
      ...EXPANDED_ENDURANCE_OTHER_METADATA,
      ...ICONIC_ENDURANCE_METADATA,
    ]);
    expect(report.size).toBe(198);
    expect(report.validStructureCount).toBe(198);
    expect(report.categoryCounts).toEqual({ bike: 48, other: 28, run: 50, strength: 25, swim: 47 });
    expect(report.duplicateIds).toEqual([]);
    expect(report.duplicateNames).toEqual([]);
    expect(report.exactSemanticDuplicates).toEqual([]);
    expect(report.metadataMismatches).toEqual([]);
    expect(report.progressionScore).toBe(1);
    expect(report.objectiveScore).toBeGreaterThan(85);
  });

  it("preserves the expansion identities and high-intensity safety limits", () => {
    expect([
      EXPANDED_ENDURANCE_BIKE_ACTIVITIES.length,
      EXPANDED_ENDURANCE_RUN_ACTIVITIES.length,
      EXPANDED_ENDURANCE_SWIM_ACTIVITIES.length,
      EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES.length,
      EXPANDED_ENDURANCE_OTHER_ACTIVITIES.length,
    ]).toEqual([28, 20, 36, 20, 20]);
    const expansionIds = [
      ...EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
      ...EXPANDED_ENDURANCE_RUN_ACTIVITIES,
      ...EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
      ...EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
      ...EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
    ].map((plan) => plan.id);
    expect(new Set(expansionIds).size).toBe(124);
    expect(EXPANDED_ENDURANCE_BIKE_ACTIVITIES[0]?.id).toBe("b1c00000-0001-4000-8001-000000000001");
    expect(EXPANDED_ENDURANCE_OTHER_ACTIVITIES.at(-1)?.id).toBe(
      "f2a00000-0005-4000-8004-000000000020",
    );

    const runShortEfforts = EXPANDED_ENDURANCE_RUN_ACTIVITIES.filter((plan) =>
      /Anaerobic|Neuromuscular/.test(plan.name),
    ).flatMap((plan) => activityIntervals(plan).flatMap((interval) => interval.steps));
    expect(
      runShortEfforts
        .filter((step) => step.name === "Work")
        .every((step) => step.duration.type === "time" && step.duration.seconds <= 45),
    ).toBe(true);
    const swimShortEfforts = EXPANDED_ENDURANCE_SWIM_ACTIVITIES.filter((plan) =>
      /Anaerobic|Neuromuscular/.test(plan.name),
    ).flatMap((plan) => activityIntervals(plan).flatMap((interval) => interval.steps));
    expect(
      swimShortEfforts
        .filter((step) => step.name === "Work")
        .every((step) => step.duration.type === "distance" && step.duration.meters <= 50),
    ).toBe(true);
  });

  it("keeps authored pacing structures and rejects progression by labels alone", () => {
    const negativeSplit = EXPANDED_ENDURANCE_SWIM_ACTIVITIES.find(
      (plan) => plan.name === "Tempo Negative-Split Swim — Race",
    );
    expect(
      negativeSplit
        ? activityIntervals(negativeSplit)
            .flatMap((interval) => interval.steps)
            .filter((step) => /First Half|Second Half/.test(step.name))
            .flatMap((step) => step.targets.map((target) => target.intensity))
        : [],
    ).toEqual([5, 6]);
    const familyPlans = EXPANDED_ENDURANCE_BIKE_ACTIVITIES.slice(0, 4);
    const foundation = familyPlans[0];
    const advanced = familyPlans[2];
    if (!foundation || !advanced) throw new Error("Expected a complete progression fixture");
    const stalledPlans = familyPlans.map((plan) =>
      plan.id === advanced.id ? { ...plan, structure: foundation.structure } : plan,
    );
    expect(
      evaluateActivityPlanPortfolio(stalledPlans, EXPANDED_ENDURANCE_BIKE_METADATA.slice(0, 4))
        .progressionScore,
    ).toBe(0);
  });
});
