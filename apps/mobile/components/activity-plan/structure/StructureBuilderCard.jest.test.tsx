import type { ActivityPlanDraftItem, ActivityPlanDraftStep } from "@repo/core";
import { Alert } from "react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { fireEvent, renderNative, screen } from "@/test/render-native";
import { StructureBuilderCard } from "./StructureBuilderCard";

const mockDragListProps: Array<{ onDragEnd?: (event: { from: number; to: number }) => void }> = [];
jest.mock("react-native-draggable-flatlist", () => {
  const { MockDraggableFlatList } = require("@/test/draggable-flat-list");
  return {
    NestableDraggableFlatList: (props: {
      onDragEnd?: (event: { from: number; to: number }) => void;
    }) => {
      mockDragListProps.push(props);
      return MockDraggableFlatList(props);
    },
  };
});

const step = (id: string): ActivityPlanDraftStep => ({
  type: "step",
  id,
  name: id,
  duration: { type: "time", seconds: 60 },
  targets: [],
});
const repeat = (id: string, steps: ActivityPlanDraftStep[]): ActivityPlanDraftItem => ({
  type: "repeat",
  id,
  count: 2,
  steps,
});

describe("StructureBuilderCard V5 controls", () => {
  beforeEach(() => {
    useActivityPlanCreationStore.getState().reset();
    mockDragListProps.length = 0;
  });

  it("passes exact root and nested drag destinations to the actual store and updates final order", async () => {
    const store = useActivityPlanCreationStore.getState();
    const items = [step("root"), repeat("repeat", [step("one"), step("two")])];
    store.setStructure({ version: 5, activity_category: "run", items });
    const move = jest.fn(store.moveItem);
    await renderNative(
      <StructureBuilderCard
        activityCategory="run"
        items={items}
        validationErrors={{}}
        onEditStep={jest.fn()}
        onAddStep={jest.fn()}
        onAddRepeat={jest.fn()}
        onRemove={store.removeItem}
        onDuplicate={store.duplicateItem}
        onUngroup={store.ungroupRepeat}
        onMove={move}
        onRepeatCount={store.updateRepeatCount}
      />,
    );

    mockDragListProps[0]?.onDragEnd?.({ from: 0, to: 1 });
    mockDragListProps[1]?.onDragEnd?.({ from: 1, to: 0 });
    expect(move).toHaveBeenNthCalledWith(1, "root", { index: 1 });
    expect(move).toHaveBeenNthCalledWith(2, "two", { repeatId: "repeat", index: 0 });

    store.moveItem("root", { index: 1 });
    store.moveItem("two", { repeatId: "repeat", index: 0 });
    expect(useActivityPlanCreationStore.getState().structure.items).toMatchObject([
      { id: "repeat", steps: [{ id: "two" }, { id: "one" }] },
      { id: "root" },
    ]);
  });

  it("exposes uniquely labelled cross-repeat destinations and confirms repeat deletion", async () => {
    const store = useActivityPlanCreationStore.getState();
    const items = [repeat("a", [step("a1")]), repeat("b", [step("b1")])];
    store.setStructure({ version: 5, activity_category: "run", items });
    const remove = jest.fn(store.removeItem);
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, actions) =>
        actions?.find((x) => x.text === "Delete repeat")?.onPress?.(),
      );
    await renderNative(
      <StructureBuilderCard
        activityCategory="run"
        items={items}
        validationErrors={{}}
        onEditStep={jest.fn()}
        onAddStep={jest.fn()}
        onAddRepeat={jest.fn()}
        onRemove={remove}
        onDuplicate={store.duplicateItem}
        onUngroup={store.ungroupRepeat}
        onMove={store.moveItem}
        onRepeatCount={store.updateRepeatCount}
      />,
    );
    expect(screen.getByLabelText("Move to repeat 2 Repeat 1, step 1")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Delete repeat 1"));
    expect(alert).toHaveBeenCalledWith("Delete repeat?", expect.any(String), expect.any(Array));
    expect(remove).toHaveBeenCalledWith("a");
  });

  it("keeps repeat count and primary step actions on compact horizontal rows", async () => {
    const items = [repeat("repeat", [step("one")])];
    await renderNative(
      <StructureBuilderCard
        activityCategory="run"
        items={items}
        validationErrors={{}}
        onEditStep={jest.fn()}
        onAddStep={jest.fn()}
        onAddRepeat={jest.fn()}
        onRemove={() => ({ success: true })}
        onDuplicate={() => ({ success: true })}
        onUngroup={() => ({ success: true })}
        onMove={() => ({ success: true })}
        onRepeatCount={() => ({ success: true })}
      />,
    );
    expect(screen.getByTestId("repeat-header-repeat").props.className).toContain("flex-row");
    expect(screen.getByText("Repeat 1 × 2")).toBeTruthy();
    expect(screen.getByLabelText("Duplicate Repeat 1, step 1").props.className).toContain(
      "min-h-12",
    );
    expect(screen.getByLabelText("Reorder repeat 1").props.className).toContain("min-w-12");
    expect(screen.getByLabelText("Reorder Repeat 1, step 1").props.className).toContain("min-h-12");
  });
});
