import {
  type ActivityPlanDuration,
  type ActivityPlanStructureV3,
  type ActivityPlanTarget,
  activityPlanStructureSchemaV3,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  calculateWorkoutDuration,
  convertToWahooPlan,
  validateWahooCompatibility,
  validateWahooPlanContract,
} from "./plan-converter";

const id = (value: number) => `70000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function structure(
  input: {
    category?: "run" | "bike" | "swim";
    duration?: ActivityPlanDuration;
    repetitions?: number;
    targets?: ActivityPlanTarget[];
  } = {},
): ActivityPlanStructureV3 {
  return activityPlanStructureSchemaV3.parse({
    version: 3,
    segments: [
      {
        id: id(1),
        role: "activity",
        category: input.category ?? "bike",
        name: "Main",
        intervals: [
          {
            id: id(2),
            name: "Set",
            repetitions: input.repetitions ?? 1,
            steps: [
              {
                id: id(3),
                name: "Work",
                duration: input.duration ?? { type: "time", seconds: 600 },
                targets: input.targets ?? [{ type: "watts", intensity: 220 }],
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("Wahoo V3 plan converter", () => {
  it("preserves supported single-sport bike occurrences", () => {
    const source = structure({ repetitions: 3, targets: [{ type: "%FTP", intensity: 80 }] });
    const plan = convertToWahooPlan(source, {
      activityType: "bike",
      ftp: 250,
      name: "Bike set",
    });

    expect(plan.intervals).toHaveLength(3);
    expect(plan.intervals).toEqual(
      Array.from({ length: 3 }, () => ({
        name: "Work",
        exit_trigger_type: "time",
        exit_trigger_value: 600,
        intensity_type: "tempo",
        targets: [{ type: "ftp", low: 0.76, high: 0.8400000000000001 }],
      })),
    );
    expect(calculateWorkoutDuration(source)).toBe(1800);
    expect(validateWahooPlanContract(plan)).toEqual({ valid: true, errors: [] });
  });

  it("preserves supported single-sport run distance and speed", () => {
    const source = structure({
      category: "run",
      duration: { type: "distance", meters: 1000 },
      targets: [{ type: "speed", intensity: 18 }],
    });
    const plan = convertToWahooPlan(source, { activityType: "run", name: "Run" });

    expect(plan.intervals[0]).toEqual({
      name: "Work",
      exit_trigger_type: "distance",
      exit_trigger_value: 1000,
      intensity_type: "active",
      targets: [{ type: "speed", low: 4.75, high: 5.25 }],
    });
    expect(validateWahooCompatibility(source, { activityType: "run", name: "Run" })).toMatchObject({
      compatible: true,
      disposition: "compatible",
      issues: [],
    });
  });

  it("returns structured unsupported findings for boundaries and mixed categories", () => {
    const runSegment = structure({
      category: "run",
      targets: [{ type: "speed", intensity: 12 }],
    }).segments[0];
    if (runSegment?.role !== "activity") throw new Error("Expected activity segment");
    const source = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        structure().segments[0],
        { id: id(4), role: "transition", name: "T1", duration: { type: "time", seconds: 60 } },
        {
          ...runSegment,
          id: id(5),
          intervals: runSegment.intervals.map((interval) => ({
            ...interval,
            id: id(6),
            steps: interval.steps.map((step) => ({ ...step, id: id(7) })),
          })),
        },
      ],
    });
    const result = validateWahooCompatibility(source, { activityType: "bike", name: "Brick" });

    expect(result.compatible).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disposition: "unsupported",
          path: ["structure", "segments"],
          reasonCode: "mixed_activity_categories",
          semantic: "provider",
        }),
        expect.objectContaining({
          disposition: "unsupported",
          reasonCode: "unsupported_boundary",
          semantic: "occurrence_role",
        }),
      ]),
    );
  });

  it.each([
    [{ type: "RPE", intensity: 6 } as const, {}, "unsupported_target"],
    [{ type: "%FTP", intensity: 80 } as const, {}, "missing_target_anchor"],
  ])("blocks unsupported or unresolved target %o", (target, metrics, reasonCode) => {
    const result = validateWahooCompatibility(structure({ targets: [target] }), {
      activityType: "bike",
      name: "Bike",
      ...metrics,
    });
    expect(result.compatible).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ reasonCode }));
  });

  it.each([
    "repetitions",
    "untilFinished",
  ] as const)("blocks %s completion rather than substituting guessed time", (type) => {
    const duration: ActivityPlanDuration = type === "repetitions" ? { type, count: 10 } : { type };
    const result = validateWahooCompatibility(structure({ duration }), {
      activityType: "bike",
      name: "Bike",
    });
    expect(result.compatible).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ reasonCode: "unsupported_duration", semantic: "duration" }),
    );
  });

  it("reports secondary supported targets as an explicit degraded projection", () => {
    const result = validateWahooCompatibility(
      structure({
        targets: [
          { type: "watts", intensity: 220 },
          { type: "bpm", intensity: 150 },
        ],
      }),
      { activityType: "bike", name: "Bike" },
    );

    expect(result).toMatchObject({ compatible: true, disposition: "degraded" });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        disposition: "degraded",
        reasonCode: "secondary_target_not_displayed",
      }),
    );
    expect(result.warnings[0]).toMatch(/displays only the selected preferred target/);
  });

  it("shares run target preference so speed is retained and authored-first bpm is degraded", () => {
    const source = structure({
      category: "run",
      targets: [
        { type: "bpm", intensity: 150 },
        { type: "speed", intensity: 18 },
      ],
    });
    const compatibility = validateWahooCompatibility(source, {
      activityType: "run",
      name: "Run",
    });
    const targetFindings = compatibility.findings.filter(
      (finding) => finding.semantic === "target",
    );

    expect(targetFindings).toEqual([
      expect.objectContaining({
        disposition: "degraded",
        reasonCode: "secondary_target_not_displayed",
        targetProjection: "dropped",
      }),
      expect.objectContaining({
        disposition: "compatible",
        reasonCode: "selected_target_retained",
        targetProjection: "retained",
      }),
    ]);
    expect(
      convertToWahooPlan(source, { activityType: "run", name: "Run" }).intervals[0]?.targets,
    ).toEqual([{ type: "speed", low: 4.75, high: 5.25 }]);
  });

  it("retains speed when speed is authored before bpm", () => {
    const source = structure({
      category: "run",
      targets: [
        { type: "speed", intensity: 18 },
        { type: "bpm", intensity: 150 },
      ],
    });
    const compatibility = validateWahooCompatibility(source, {
      activityType: "run",
      name: "Run",
    });
    expect(compatibility.findings.find((finding) => finding.targetType === "speed")).toMatchObject({
      targetProjection: "retained",
    });
    expect(compatibility.findings.find((finding) => finding.targetType === "bpm")).toMatchObject({
      targetProjection: "dropped",
    });
  });

  it.each([
    [{ type: "bpm", intensity: 150 } as const, { type: "%ThresholdHR", intensity: 85 } as const],
    [{ type: "%ThresholdHR", intensity: 85 } as const, { type: "bpm", intensity: 150 } as const],
  ])("retains bpm ahead of relative HR regardless authored order", (first, second) => {
    const source = structure({ category: "run", targets: [first, second] });
    const compatibility = validateWahooCompatibility(source, {
      activityType: "run",
      name: "Run",
    });
    const targetFindings = compatibility.findings.filter(
      (finding) => finding.semantic === "target",
    );

    expect(targetFindings.find((finding) => finding.targetType === "bpm")).toMatchObject({
      disposition: "compatible",
      reasonCode: "selected_target_retained",
      targetProjection: "retained",
    });
    expect(targetFindings.find((finding) => finding.targetType === "%ThresholdHR")).toMatchObject({
      disposition: "degraded",
      reasonCode: "secondary_target_not_displayed",
      targetProjection: "dropped",
    });
    const plan = convertToWahooPlan(source, {
      activityType: "run",
      name: "Run",
    });
    expect(plan.header.threshold_hr).toBeUndefined();
    expect(plan.intervals[0]?.targets).toEqual([{ type: "hr", low: 145, high: 155 }]);
  });
});
