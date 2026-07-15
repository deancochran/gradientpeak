import { describe, expect, it } from "vitest";
import type { ActivityPlanStructureV2, IntervalStepV2 } from "../schemas/activity_plan_v2";
import { getPlannedWorkoutExportCompatibility } from "./plannedWorkoutExportCompatibility";
import {
  mapActivityPlanToPlannedWorkoutExportDocument,
  plannedWorkoutExportDocumentSchema,
} from "./plannedWorkoutExportDocument";

const stepIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
] as const;

function structureWithSteps(steps: IntervalStepV2[], repetitions = 1): ActivityPlanStructureV2 {
  return {
    version: 2,
    intervals: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        name: "Main set",
        notes: "Keep the repeats even",
        repetitions,
        steps,
      },
    ],
  };
}

describe("planned workout export document", () => {
  it("preserves repeats and all duration kinds", () => {
    const structure = structureWithSteps(
      [
        { id: stepIds[0], name: "Time", duration: { type: "time", seconds: 60 } },
        { id: stepIds[1], name: "Distance", duration: { type: "distance", meters: 400 } },
        {
          id: stepIds[2],
          name: "Repetitions",
          duration: { type: "repetitions", count: 12 },
        },
        { id: stepIds[3], name: "Open", duration: { type: "untilFinished" } },
      ],
      3,
    );

    const document = mapActivityPlanToPlannedWorkoutExportDocument({
      event: { id: "event-1", name: "Mixed workout", sport: "run" },
      structure,
    });

    expect(document.blocks[0]).toMatchObject({
      kind: "repeat",
      count: 3,
      steps: [
        { duration: { kind: "time", value: 60, unit: "seconds" } },
        { duration: { kind: "distance", value: 400, unit: "meters" } },
        { duration: { kind: "repetitions", value: 12, unit: "count" } },
        { duration: { kind: "open" } },
      ],
    });
  });

  it("normalizes units, resolves relative anchors, and preserves target order", () => {
    const structure = structureWithSteps([
      {
        id: stepIds[0],
        name: "Targets",
        duration: { type: "time", seconds: 300 },
        targets: [
          { type: "speed", intensity: 18 },
          { type: "%MaxHR", intensity: 80 },
          { type: "cadence", intensity: 90 },
        ],
      },
    ]);

    const document = mapActivityPlanToPlannedWorkoutExportDocument({
      anchors: { maxHeartRateBpm: 200 },
      event: { id: "event-2", name: "Target workout", sport: "run" },
      structure,
    });

    expect(document.blocks[0]?.steps[0]?.targets).toEqual([
      {
        kind: "absolute",
        metric: "speed",
        sourceValue: 18,
        sourceUnit: "kilometers_per_hour",
        value: 5,
        unit: "meters_per_second",
      },
      {
        kind: "relative",
        metric: "heart_rate",
        basis: "maximum_heart_rate",
        value: 80,
        unit: "percent",
        resolvedValue: 160,
        resolvedUnit: "beats_per_minute",
      },
      {
        kind: "absolute",
        metric: "cadence",
        sourceValue: 90,
        sourceUnit: "revolutions_per_minute",
        value: 90,
        unit: "revolutions_per_minute",
      },
    ]);
  });

  it("is deterministic and includes no generated timestamp", () => {
    const input = {
      event: {
        id: "event-3",
        name: "Deterministic workout",
        scheduledAt: "2026-07-15T09:00:00.000Z",
        sport: "bike" as const,
      },
      structure: structureWithSteps([
        {
          id: stepIds[0],
          name: "Power",
          duration: { type: "time" as const, seconds: 600 },
          targets: [{ type: "%FTP" as const, intensity: 75 }],
        },
      ]),
      anchors: { ftpWatts: 240 },
    };

    const first = mapActivityPlanToPlannedWorkoutExportDocument(input);
    const second = mapActivityPlanToPlannedWorkoutExportDocument(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).not.toHaveProperty("generatedAt");
    expect(first.blocks[0]?.steps[0]?.targets[0]).toMatchObject({
      resolvedValue: 180,
      resolvedUnit: "watts",
    });
  });

  it("reports unsupported sports and targets without dropping secondary targets", () => {
    const unsupportedTarget = structureWithSteps([
      {
        id: stepIds[0],
        name: "Bike speed",
        duration: { type: "time", seconds: 60 },
        targets: [
          { type: "watts", intensity: 200 },
          { type: "speed", intensity: 30 },
        ],
      },
    ]);

    expect(
      getPlannedWorkoutExportCompatibility({ sport: "bike", structure: unsupportedTarget }),
    ).toMatchObject({
      compatible: false,
      issues: [
        { code: "unsupported_target", path: ["intervals", 0, "steps", 0, "targets", 1, "type"] },
      ],
    });
    expect(
      getPlannedWorkoutExportCompatibility({
        sport: "swim",
        structure: structureWithSteps([
          {
            id: stepIds[0],
            name: "Swim",
            duration: { type: "distance", meters: 100 },
            targets: [{ type: "RPE", intensity: 5 }],
          },
        ]),
      }).issues,
    ).toContainEqual(expect.objectContaining({ code: "unsupported_sport" }));
  });

  it("enforces expanded size and per-step duration limits", () => {
    const tooLong = structureWithSteps(
      [{ id: stepIds[0], name: "Long", duration: { type: "time", seconds: 86_400 } }],
      8,
    );

    expect(
      getPlannedWorkoutExportCompatibility({ sport: "run", structure: tooLong }),
    ).toMatchObject({
      compatible: false,
      issues: [{ code: "size_limit" }],
    });

    const validDocument = mapActivityPlanToPlannedWorkoutExportDocument({
      event: { id: "event-4", name: "Open", sport: "run" },
      structure: structureWithSteps([
        { id: stepIds[0], name: "Open", duration: { type: "untilFinished" } },
      ]),
    });
    expect(plannedWorkoutExportDocumentSchema.safeParse(validDocument).success).toBe(true);

    const invalidDocument = structuredClone(validDocument);
    const firstStep = invalidDocument.blocks.at(0)?.steps.at(0);
    if (firstStep == null) {
      throw new Error("Expected mapped workout step");
    }
    firstStep.duration = {
      kind: "distance",
      value: 1_000_001,
      unit: "meters",
    };
    expect(plannedWorkoutExportDocumentSchema.safeParse(invalidDocument).success).toBe(false);
  });
});
