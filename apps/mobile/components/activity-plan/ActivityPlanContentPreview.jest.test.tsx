import { createHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { ActivityPlanContentPreview, ActivityPlanRepeatSteps } from "./ActivityPlanContentPreview";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step" as const,
      id: id(1),
      name: "Warm up",
      instructions: "Start easy",
      duration: { type: "time" as const, seconds: 300 },
      targets: [],
    },
    {
      type: "repeat" as const,
      id: id(2),
      count: 2,
      steps: [
        {
          type: "step" as const,
          id: id(3),
          name: "Tempo",
          instructions: "Stay smooth",
          duration: { type: "time" as const, seconds: 300 },
          targets: [{ type: "RPE" as const, intensity: 7 }],
        },
        {
          type: "step" as const,
          id: id(4),
          duration: { type: "time" as const, seconds: 60 },
          targets: [],
        },
      ],
    },
  ],
};

describe("ActivityPlanContentPreview V5", () => {
  it("shows root items then each repeat definition once, in authored order", async () => {
    await renderNative(
      <ActivityPlanContentPreview plan={{ structure }} size="large" testIDPrefix="preview" />,
    );

    expect(screen.getByTestId("preview-timeline")).toBeTruthy();
    expect(screen.getByText("Warm up")).toBeTruthy();
    expect(screen.getByText("Start easy")).toBeTruthy();
    expect(screen.getByText("Repeat × 2")).toBeTruthy();
    expect(screen.getByText("Tempo")).toBeTruthy();
    expect(screen.getAllByText("Tempo")).toHaveLength(1);
    expect(screen.getByText("Stay smooth")).toBeTruthy();
  });

  it("shows a targetless duration without repeat metadata or fabricated effort", async () => {
    const targetless = { ...structure, items: [structure.items[0]] };
    await renderNative(
      <ActivityPlanContentPreview plan={{ structure: targetless }} size="large" />,
    );

    expect(screen.getByText("5min")).toBeTruthy();
    expect(screen.queryByText(/Repeat/)).toBeNull();
    expect(screen.queryByText(/^at /)).toBeNull();
  });

  it("uses whole-second editor pace notation in the readonly and interactive flows", async () => {
    const repeat = structure.items[1];
    if (!repeat || repeat.type !== "repeat") throw new Error("Expected repeat fixture");
    const firstStep = repeat.steps[0];
    if (!firstStep) throw new Error("Expected repeat child fixture");
    const paceRepeat = {
      ...repeat,
      count: 3,
      steps: [
        {
          ...firstStep,
          targets: [{ type: "speed" as const, intensity: 13.33 }],
        },
      ],
    };
    await renderNative(
      <ActivityPlanContentPreview
        plan={{ structure: { ...structure, items: [paceRepeat] } }}
        size="large"
      />,
    );
    expect(screen.getByText("5min at 4:30/km")).toBeTruthy();

    const onTargetPress = jest.fn();
    await renderNative(
      <ActivityPlanRepeatSteps
        activityCategory="run"
        repeat={paceRepeat}
        onTargetPress={onTargetPress}
      />,
    );
    fireEvent.press(screen.getByLabelText("Edit 4:30/km for Tempo"));
    expect(onTargetPress).toHaveBeenCalledWith(id(3), 0);
  });

  it("keeps readonly prescriptions free of editable child controls and hides unavailable structure", async () => {
    const repeat = structure.items[1];
    if (!repeat || repeat.type !== "repeat") throw new Error("Expected repeat fixture");
    await renderNative(<ActivityPlanRepeatSteps activityCategory="run" repeat={repeat} />);
    expect(screen.queryByLabelText("Edit duration for Tempo")).toBeNull();
    expect(screen.queryByLabelText("Edit 7 RPE for Tempo")).toBeNull();

    await renderNative(<ActivityPlanContentPreview plan={{}} testIDPrefix="preview" />);
    expect(screen.queryByTestId("preview")).toBeNull();
  });
});
