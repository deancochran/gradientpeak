import { describe, expect, it } from "vitest";
import {
  type ActivityPlanItem,
  activityPlanDraftStructureSchema,
  activityPlanStructureSchema,
  compileActivityPlan,
  duplicateActivityPlanItem,
  insertActivityPlanItem,
  moveActivityPlanItem,
  ungroupActivityPlanRepeat,
} from "../index";
import { ACTIVITY_PLAN_LIMITS } from "../structure-validation";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const step = (value: number) => ({
  type: "step" as const,
  id: id(value),
  duration: { type: "time" as const, seconds: 60 },
  targets: [],
});
const plan = () => ({
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    step(1),
    { type: "repeat" as const, id: id(2), count: 5, steps: [step(3), step(4)] },
    step(5),
  ],
});

describe("V5 activity-plan structure", () => {
  it("expands standalone/repeat work chronologically without synthetic block identity", () => {
    const compiled = compileActivityPlan(plan());
    expect(compiled.occurrences).toHaveLength(12);
    expect(compiled.occurrences.map((occurrence) => occurrence.stepId)).toEqual([
      id(1),
      id(3),
      id(4),
      id(3),
      id(4),
      id(3),
      id(4),
      id(3),
      id(4),
      id(3),
      id(4),
      id(5),
    ]);
    expect(compiled.occurrences[0]).not.toHaveProperty("repeatId");
    expect(compiled.occurrences[1]).toMatchObject({
      repeatId: id(2),
      repeatIteration: 0,
      ordinal: 1,
    });
  });
  it("accepts a one-child repeat and rejects nesting and count one", () => {
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [{ type: "repeat", id: id(2), count: 2, steps: [step(3)] }],
      }).success,
    ).toBe(true);
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [{ type: "repeat", id: id(2), count: 1, steps: [step(3)] }],
      }).success,
    ).toBe(false);
    expect(
      activityPlanStructureSchema.safeParse({
        ...plan(),
        items: [
          {
            type: "repeat",
            id: id(2),
            count: 2,
            steps: [{ type: "repeat", id: id(3), count: 2, steps: [step(4)] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("preserves moved IDs, assigns duplicate IDs, and ungroups in place", () => {
    const source = plan().items;
    const moved = moveActivityPlanItem(source, id(1), { repeatId: id(2), index: 1 });
    expect(moved).toMatchObject({ ok: true });
    if (!moved.ok) return;
    expect(moved.items[0]).toMatchObject({ id: id(2), type: "repeat" });
    const copied = duplicateActivityPlanItem(
      moved.items,
      id(2),
      (() => {
        let value = 10;
        return () => id(value++);
      })(),
    );
    expect(copied).toMatchObject({ ok: true });
    if (!copied.ok) return;
    expect(copied.items[1]).toMatchObject({ id: id(10), type: "repeat" });
    let nextId = 20;
    const ungrouped = ungroupActivityPlanRepeat(source, id(2), () => id(nextId++));
    expect(ungrouped.ok).toBe(true);
    if (!ungrouped.ok) throw new Error("Ungroup must succeed");
    expect(ungrouped.items).toHaveLength(12);
    expect(new Set(ungrouped.items.map((item) => item.id)).size).toBe(12);
    expect(
      compileActivityPlan({ ...plan(), items: ungrouped.items }).occurrences.map(
        (occurrence) => occurrence.duration,
      ),
    ).toEqual(compileActivityPlan(plan()).occurrences.map((occurrence) => occurrence.duration));
  });
  it("rejects duplicate generated IDs rather than returning a corrupt duplicate", () => {
    const copied = duplicateActivityPlanItem(plan().items, id(2), () => id(1));
    expect(copied).toEqual({ ok: false, reason: "duplicate_id" });
  });
  it("enforces root and expanded occurrence limits during operations", () => {
    const roots: ActivityPlanItem[] = Array.from(
      { length: ACTIVITY_PLAN_LIMITS.maxItems },
      (_, index) => step(index + 100),
    );
    expect(insertActivityPlanItem(roots, { index: roots.length }, step(9_999))).toEqual({
      ok: false,
      reason: "limit_exceeded",
    });
    const largeRepeat = {
      type: "repeat" as const,
      id: id(500),
      count: ACTIVITY_PLAN_LIMITS.maxRepeatCount,
      steps: Array.from({ length: ACTIVITY_PLAN_LIMITS.maxStepsPerRepeat }, (_, index) =>
        step(index + 600),
      ),
    };
    const nearExpandedLimit: ActivityPlanItem[] = [step(9_999)];
    expect(insertActivityPlanItem(nearExpandedLimit, { index: 1 }, largeRepeat)).toEqual({
      ok: false,
      reason: "limit_exceeded",
    });
  });
  it("retains incomplete null draft values without coercion", () => {
    const draft = {
      version: 5 as const,
      activity_category: null,
      items: [{ ...step(1), duration: null, targets: [{ type: "RPE" as const, intensity: null }] }],
    };
    expect(activityPlanDraftStructureSchema.parse(draft)).toEqual(draft);
  });
  it("rejects invalid draft identities while allowing incomplete measurements", () => {
    const nil = "00000000-0000-0000-0000-000000000000";
    expect(
      activityPlanDraftStructureSchema.safeParse({
        ...plan(),
        items: [{ type: "repeat", id: nil, count: 2, steps: [] }],
      }).success,
    ).toBe(false);
    expect(
      activityPlanDraftStructureSchema.safeParse({
        ...plan(),
        items: [
          step(1),
          { type: "repeat", id: id(2), count: 2, steps: [{ ...step(1), duration: null }] },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects aggregate timed and payload limits without mutating its input", () => {
    const source = Array.from({ length: 7 }, (_, i) => ({
      ...step(i + 100),
      duration: { type: "time" as const, seconds: 86400 },
    }));
    const before = JSON.stringify(source);
    expect(
      insertActivityPlanItem(
        source,
        { index: 7 },
        { ...step(200), duration: { type: "time", seconds: 86400 } },
      ),
    ).toEqual({ ok: false, reason: "limit_exceeded" });
    expect(JSON.stringify(source)).toBe(before);
    expect(
      insertActivityPlanItem(
        [],
        { index: 0 },
        { ...step(1), instructions: "x".repeat(ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes) },
      ),
    ).toEqual({ ok: false, reason: "limit_exceeded" });
    expect(moveActivityPlanItem(plan().items, id(3), { repeatId: id(999), index: 0 })).toEqual({
      ok: false,
      reason: "invalid_destination",
    });
  });
});
