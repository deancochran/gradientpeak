import type { ActivityPlanDraftItem, ActivityPlanDraftStep } from "@repo/core";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

jest.mock("expo-crypto", () => ({
  randomUUID: jest
    .fn()
    .mockReturnValueOnce("copy-repeat")
    .mockReturnValueOnce("copy-step-a")
    .mockReturnValueOnce("copy-step-b")
    .mockReturnValue("copy-step"),
}));

const step = (id: string, name = id): ActivityPlanDraftStep => ({
  type: "step",
  id,
  name,
  duration: { type: "time", seconds: 60 },
  targets: [],
});
const repeat = (
  id: string,
  count: number,
  steps: ActivityPlanDraftStep[],
): ActivityPlanDraftItem => ({
  type: "repeat",
  id,
  count,
  steps,
});
const ids = () =>
  useActivityPlanCreationStore
    .getState()
    .structure.items.flatMap((item) =>
      item.type === "repeat" ? [item.id, ...item.steps.map((x) => x.id)] : [item.id],
    );

describe("activity-plan V5 composition operations", () => {
  beforeEach(() => useActivityPlanCreationStore.getState().reset());

  it("keeps root steps and repeat children in authored chronology while moving in, out, and across repeats", () => {
    const store = useActivityPlanCreationStore.getState();
    store.setActivityCategory("run");
    store.setStructure({
      version: 5,
      activity_category: "run",
      items: [
        step("warmup"),
        repeat("sets-a", 2, [step("a1"), step("a2")]),
        step("cooldown"),
        repeat("sets-b", 3, [step("b1")]),
      ],
    });

    expect(store.moveItem("warmup", { repeatId: "sets-a", index: 1 })).toEqual({ success: true });
    expect(store.moveItem("a2", { index: 1 })).toEqual({ success: true });
    expect(store.moveItem("b1", { repeatId: "sets-a", index: 0 })).toEqual({ success: true });
    const items = useActivityPlanCreationStore.getState().structure.items;
    expect(items.map((item) => item.id)).toEqual(["sets-a", "a2", "cooldown"]);
    expect(items[0]).toMatchObject({
      id: "sets-a",
      steps: [{ id: "b1" }, { id: "a1" }, { id: "warmup" }],
    });
    expect(ids()).toEqual(["sets-a", "b1", "a1", "warmup", "a2", "cooldown"]);
  });

  it("reorders complete repeats, preserves unique fresh IDs on duplicate, and ungroups the full prescribed count", () => {
    const store = useActivityPlanCreationStore.getState();
    store.setStructure({
      version: 5,
      activity_category: "run",
      items: [repeat("first", 2, [step("first-step")]), repeat("second", 3, [step("second-step")])],
    });
    expect(store.moveItem("second", { index: 0 })).toEqual({ success: true });
    expect(store.duplicateItem("second")).toEqual({ success: true });
    expect(new Set(ids()).size).toBe(ids().length);
    expect(store.ungroupRepeat("first")).toEqual({ success: true });
    expect(useActivityPlanCreationStore.getState().structure.items.map((item) => item.id)).toEqual([
      "second",
      "copy-repeat",
      "first-step",
      "copy-step-b",
    ]);
    expect(
      useActivityPlanCreationStore
        .getState()
        .structure.items.filter((item) => item.type === "step"),
    ).toHaveLength(2);
  });

  it("rejects duplicate IDs and visible-limit additions without changing the current draft", () => {
    const store = useActivityPlanCreationStore.getState();
    store.setStructure({ version: 5, activity_category: "run", items: [step("one")] });
    expect(store.insertItem(step("one"))).toEqual({
      success: false,
      error: "This change would create duplicate item IDs.",
    });
    const huge = Array.from({ length: 51 }, (_, index) => step(`s-${index}`));
    expect(store.insertItem(repeat("too-many", 2, huge))).toEqual({
      success: false,
      error: "This change exceeds the activity-plan limits.",
    });
    expect(useActivityPlanCreationStore.getState().structure.items).toEqual([step("one")]);
  });
});
