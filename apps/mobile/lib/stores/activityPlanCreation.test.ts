import { beforeEach, describe, expect, it, vi } from "vitest";

const cryptoMock = vi.hoisted(() => ({ next: 99 }));
vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++cryptoMock.next).padStart(12, "0")}`),
}));

import { createBlankActivityPlanDraft, useActivityPlanCreationStore } from "./activityPlanCreation";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const step = (n: number) => ({
  type: "step" as const,
  id: id(n),
  duration: { type: "distance" as const, meters: 100 },
  targets: [],
});

describe("activityPlanCreation V5 structure operations", () => {
  beforeEach(() => {
    cryptoMock.next = 99;
    useActivityPlanCreationStore.getState().reset();
  });
  it("starts with an invalid but recoverable V5 draft", () =>
    expect(createBlankActivityPlanDraft()).toEqual({
      version: 5,
      activity_category: null,
      items: [],
    }));
  it("uses Core operations for root/repeat movement, fresh duplication, and ungroup dose", () => {
    const store = useActivityPlanCreationStore.getState();
    store.insertItem(step(1));
    store.insertItem({ type: "repeat", id: id(2), count: 2, steps: [step(3)] });
    expect(store.moveItem(id(1), { repeatId: id(2), index: 1 })).toEqual({ success: true });
    expect(store.duplicateItem(id(2))).toEqual({ success: true });
    const items = useActivityPlanCreationStore.getState().structure.items;
    expect(items[1]?.id).toBe(id(100));
    expect(store.ungroupRepeat(id(2))).toEqual({ success: true });
    expect(
      useActivityPlanCreationStore
        .getState()
        .structure.items.filter((item) => item.type === "step"),
    ).toHaveLength(4);
  });
  it("keeps a step identity and location when editing its prescription", () => {
    const store = useActivityPlanCreationStore.getState();
    store.insertItem({ type: "repeat", id: id(2), count: 2, steps: [step(3)] });
    expect(store.updateStep({ ...step(3), name: "Fast" })).toEqual({ success: true });
    const repeat = useActivityPlanCreationStore.getState().structure.items[0];
    expect(repeat).toMatchObject({ type: "repeat", steps: [{ id: id(3), name: "Fast" }] });
  });
  it("rejects a repeat-count increase that exceeds expanded occurrence limits without mutating", () => {
    const store = useActivityPlanCreationStore.getState();
    const repeat = {
      type: "repeat" as const,
      id: id(1),
      count: 2,
      steps: Array.from({ length: 20 }, (_, index) => step(index + 2)),
    };
    expect(store.insertItem(repeat)).toEqual({ success: true });
    expect(
      store.insertItem({
        ...repeat,
        id: id(30),
        count: 48,
        steps: repeat.steps.map((item, index) => ({ ...item, id: id(index + 50) })),
      }),
    ).toEqual({ success: true });
    const before = useActivityPlanCreationStore.getState().structure;
    expect(store.updateRepeatCount(id(1), 50)).toEqual({
      success: false,
      error: "This change exceeds the activity-plan limits.",
    });
    expect(useActivityPlanCreationStore.getState().structure).toEqual(before);
  });
  it("rejects a repeat-count increase that exceeds explicit timed duration without mutating", () => {
    const store = useActivityPlanCreationStore.getState();
    const timedStep = {
      ...step(2),
      duration: { type: "time" as const, seconds: 86_400 },
    };
    expect(store.insertItem({ type: "repeat", id: id(1), count: 2, steps: [timedStep] })).toEqual({
      success: true,
    });
    const before = useActivityPlanCreationStore.getState().structure;
    expect(store.updateRepeatCount(id(1), 50)).toEqual({
      success: false,
      error: "This change exceeds the activity-plan limits.",
    });
    expect(useActivityPlanCreationStore.getState().structure).toEqual(before);
  });
});
