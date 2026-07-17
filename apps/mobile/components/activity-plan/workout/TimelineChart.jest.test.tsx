import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

const { TimelineChart } = require("./TimelineChart");

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const structure = {
  version: 3,
  segments: [
    {
      id: id(1),
      role: "rest",
      name: "Prepare",
      duration: { type: "time", seconds: 30 },
    },
    {
      id: id(2),
      role: "activity",
      category: "run",
      name: "First run",
      intervals: [
        {
          id: id(3),
          name: "Repeated run",
          repetitions: 2,
          steps: [
            {
              id: id(4),
              name: "Tempo",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "RPE", intensity: 3 }],
            },
          ],
        },
      ],
    },
    {
      id: id(5),
      role: "transition",
      name: "Change sport",
      duration: { type: "time", seconds: 45 },
    },
    {
      id: id(6),
      role: "activity",
      category: "bike",
      name: "Bike",
      intervals: [
        {
          id: id(7),
          name: "Bike work",
          repetitions: 1,
          steps: [
            {
              id: id(8),
              name: "Hard bike",
              duration: { type: "time", seconds: 120 },
              targets: [{ type: "RPE", intensity: 8 }],
            },
          ],
        },
      ],
    },
    {
      id: id(9),
      role: "rest",
      name: "Reset",
      duration: { type: "time", seconds: 20 },
    },
    {
      id: id(10),
      role: "activity",
      category: "run",
      name: "Second run",
      intervals: [
        {
          id: id(11),
          name: "Run finish",
          repetitions: 1,
          steps: [
            {
              id: id(12),
              name: "Fast run",
              duration: { type: "time", seconds: 240 },
              targets: [{ type: "RPE", intensity: 10 }],
            },
          ],
        },
      ],
    },
  ],
};

function occurrence(index: number) {
  return screen.getByTestId(`timeline-occurrence-${index}`);
}

describe("TimelineChart", () => {
  it("renders occurrences in compiled order with correct testIDs and labels", () => {
    renderNative(<TimelineChart structure={structure} height={120} />);

    expect(
      Array.from({ length: 7 }, (_, index) => occurrence(index).props.accessibilityLabel),
    ).toEqual([
      "rest segment 1",
      "activity segment 2",
      "activity segment 3",
      "transition segment 4",
      "activity segment 5",
      "rest segment 6",
      "activity segment 7",
    ]);
  });

  it("applies boundary and activity heights based on role and intensity", () => {
    renderNative(<TimelineChart structure={structure} height={120} />);

    // Boundary segments have fixed height 28
    expect(occurrence(0).props.style.height).toBe(28);
    expect(occurrence(3).props.style.height).toBe(28);
    expect(occurrence(5).props.style.height).toBe(28);

    // Activity heights: targetHeight(intensity) + 28
    // RPE 3: max(12, min(64, 24)) + 28 = 52
    expect(occurrence(1).props.style.height).toBe(52);
    expect(occurrence(2).props.style.height).toBe(52);
    // RPE 8: max(12, min(64, 64)) + 28 = 92
    expect(occurrence(4).props.style.height).toBe(92);
    // RPE 10: max(12, min(64, 64)) + 28 = 92
    expect(occurrence(6).props.style.height).toBe(92);

    // Width is clamped to minimum 34 for typical workout durations
    for (let i = 0; i < 7; i++) {
      expect(occurrence(i).props.style.width).toBeGreaterThanOrEqual(34);
    }
  });

  it("presses the interval represented by an expanded occurrence", () => {
    const onIntervalPress = jest.fn();
    renderNative(<TimelineChart structure={structure} onIntervalPress={onIntervalPress} />);

    fireEvent.press(occurrence(1));

    expect(onIntervalPress).toHaveBeenCalledWith(id(3));
    expect(onIntervalPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onIntervalPress for boundary segments", () => {
    const onIntervalPress = jest.fn();
    renderNative(<TimelineChart structure={structure} onIntervalPress={onIntervalPress} />);

    fireEvent.press(occurrence(0));

    expect(onIntervalPress).not.toHaveBeenCalled();
  });

  it("renders occurrences for distance and repetition durations", () => {
    renderNative(
      <TimelineChart
        height={120}
        structure={{
          version: 3,
          segments: [
            {
              id: id(20),
              role: "activity",
              category: "bike",
              name: "Mixed volume",
              intervals: [
                {
                  id: id(21),
                  name: "Work",
                  repetitions: 1,
                  steps: [
                    {
                      id: id(22),
                      name: "Short distance",
                      duration: { type: "distance", meters: 100 },
                      targets: [{ type: "watts", intensity: 100 }],
                    },
                    {
                      id: id(23),
                      name: "Long distance",
                      duration: { type: "distance", meters: 1000 },
                      targets: [{ type: "watts", intensity: 300 }],
                    },
                    {
                      id: id(24),
                      name: "Few repetitions",
                      duration: { type: "repetitions", count: 5 },
                      targets: [{ type: "bpm", intensity: 100 }],
                    },
                    {
                      id: id(25),
                      name: "Many repetitions",
                      duration: { type: "repetitions", count: 20 },
                      targets: [{ type: "bpm", intensity: 180 }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(occurrence(0)).toBeTruthy();
    expect(occurrence(3)).toBeTruthy();

    // Heights scale with intensity within each target type
    // watts 100: max(12, min(64, 50)) + 28 = 78
    expect(occurrence(0).props.style.height).toBe(78);
    // watts 300: max(12, min(64, 150)) + 28 = 92
    expect(occurrence(1).props.style.height).toBe(92);
    expect(occurrence(0).props.style.height).toBeLessThan(occurrence(1).props.style.height);

    // bpm 100: 78, bpm 180: 92
    expect(occurrence(2).props.style.height).toBe(78);
    expect(occurrence(3).props.style.height).toBe(92);
    expect(occurrence(2).props.style.height).toBeLessThan(occurrence(3).props.style.height);
  });
});
