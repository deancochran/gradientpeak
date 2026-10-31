import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
const { TimelineChart } = require("./TimelineChart");
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "repeat",
      id: id(1),
      count: 2,
      steps: [
        {
          type: "step",
          id: id(2),
          name: "Tempo",
          duration: { type: "time", seconds: 60 },
          targets: [{ type: "RPE", intensity: 7 }],
        },
      ],
    },
    {
      type: "step",
      id: id(3),
      name: "Recovery",
      duration: { type: "time", seconds: 30 },
      targets: [],
    },
  ],
};
describe("TimelineChart V5", () => {
  it("renders compiled V5 occurrences in chronological repeat order", async () => {
    await renderNative(<TimelineChart structure={structure} />);
    expect(screen.getByTestId("timeline-occurrence-0")).toBeTruthy();
    expect(screen.getByTestId("timeline-occurrence-2")).toBeTruthy();
    expect(screen.getByTestId("timeline-occurrence-0").props.accessibilityLabel).toContain(
      "activity segment 1",
    );
  });
  it("uses canonical step and repeat identities for selection and presses", async () => {
    const onStepPress = jest.fn();
    await renderNative(
      <TimelineChart
        structure={structure}
        selectedRepeatId={id(1)}
        selectedStepId={id(2)}
        onStepPress={onStepPress}
      />,
    );
    fireEvent.press(screen.getByTestId("timeline-occurrence-1"));
    expect(onStepPress).toHaveBeenCalledWith(id(2), id(1));
    expect(screen.getByTestId("timeline-occurrence-1").props.accessibilityState).toEqual({
      selected: true,
    });
  });
  it("represents an untargeted root step without inventing a target", async () => {
    await renderNative(<TimelineChart structure={structure} />);
    expect(screen.getByTestId("timeline-occurrence-2").props.accessibilityLabel).toContain(
      "30 seconds",
    );
  });
});
