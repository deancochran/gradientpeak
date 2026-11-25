import { describe, expect, it } from "vitest";

import {
  activityPlanAuthoringContentSchema,
  activityPlanStructureSchema,
  compileActivityPlan,
  getCanonicalActivityPlanStructureHashInput,
  resolveActivityPlanSessionFlow,
} from "..";
import { ACTIVITY_PLAN_LIMITS } from "../structure-validation";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const step = (value: number) => ({
  type: "step" as const,
  id: id(value),
  name: "Work",
  instructions: "Run steadily",
  duration: { type: "time" as const, seconds: 60 },
  targets: [{ type: "RPE" as const, intensity: 6 }],
});
const plan = () => ({
  version: 5 as const,
  activity_category: "run" as const,
  items: [{ type: "repeat" as const, id: id(1), count: 2, steps: [step(2), step(3)] }],
});

describe("fixed activity-plan V5 contract", () => {
  it("accepts steps and repeats with persisted instruction text", () => {
    expect(activityPlanStructureSchema.parse(plan())).toEqual(plan());
  });
  it("requires the V5 version", () => {
    expect(activityPlanStructureSchema.safeParse({ ...plan(), version: 4 }).success).toBe(false);
  });
  it("requires at least one item", () => {
    expect(activityPlanStructureSchema.safeParse({ ...plan(), items: [] }).success).toBe(false);
  });
  it("requires repeat counts of at least two", () => {
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [{ ...plan().items[0], count: 1 }],
      }).success,
    ).toBe(false);
  });
  it("accepts a one-child repeat", () => {
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [{ ...plan().items[0], steps: [step(2)] }],
      }).success,
    ).toBe(true);
  });
  it("rejects nested repeats", () => {
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [
          {
            ...plan().items[0],
            steps: [{ type: "repeat", id: id(4), count: 2, steps: [step(5)] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate item IDs", () => {
    expect(
      activityPlanStructureSchema.safeParse({ ...plan(), items: [step(1), plan().items[0]] })
        .success,
    ).toBe(false);
  });
  it("rejects unsupported target categories", () => {
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [
          {
            ...plan().items[0],
            steps: [{ ...step(2), targets: [{ type: "watts", intensity: 200 }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects malformed step duration", () => {
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [{ ...step(2), duration: { type: "time", seconds: 0 } }],
      }).success,
    ).toBe(false);
  });
  it("enforces the expanded occurrence limit", () => {
    const items = Array.from({ length: ACTIVITY_PLAN_LIMITS.maxItems }, (_, index) => ({
      type: "repeat" as const,
      id: id(index + 10),
      count: ACTIVITY_PLAN_LIMITS.maxRepeatCount,
      steps: [step(index + 2_000)],
    }));
    expect(activityPlanStructureSchema.safeParse({ ...plan(), items }).success).toBe(false);
  });
  it("compiles repeat iterations chronologically", () => {
    expect(compileActivityPlan(plan()).occurrences.map((occurrence) => occurrence.stepId)).toEqual([
      id(2),
      id(3),
      id(2),
      id(3),
    ]);
  });
  it("does not synthesize a repeat identity for standalone steps", () => {
    const compiled = compileActivityPlan({ ...plan(), items: [step(2)] });
    expect(compiled.occurrences[0]).not.toHaveProperty("repeatId");
  });
  it("rejects removed V4 block payloads without adapting them", () => {
    expect(
      activityPlanStructureSchema.safeParse({ version: 4, activity_category: "run", blocks: [] })
        .success,
    ).toBe(false);
  });
  it("hashes the same V5 document deterministically", () => {
    expect(getCanonicalActivityPlanStructureHashInput(plan())).toBe(
      getCanonicalActivityPlanStructureHashInput(structuredClone(plan())),
    );
  });
  it("keeps a valid V5 structure unchanged through session-flow resolution", () => {
    const value = plan();
    expect(
      resolveActivityPlanSessionFlow({ structure: value, personalize: true }).structure,
    ).toEqual(value);
    expect(
      activityPlanAuthoringContentSchema.safeParse({
        structure: value,
        intent: { training_intent: "general_maintenance" },
      }).success,
    ).toBe(true);
  });
});
