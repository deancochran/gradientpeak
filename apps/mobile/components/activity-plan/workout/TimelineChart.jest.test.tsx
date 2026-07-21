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

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
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
      "rest segment 1, 30 seconds",
      "activity segment 2, run, RPE 3, 60 seconds",
      "activity segment 3, run, RPE 3, 60 seconds",
      "transition segment 4, Run to Bike, 45 seconds",
      "activity segment 5, bike, RPE 8, 120 seconds",
      "rest segment 6, 20 seconds",
      "activity segment 7, run, RPE 10, 240 seconds",
    ]);
  });

  it("applies boundary and activity heights based on role and intensity", () => {
    renderNative(<TimelineChart structure={structure} height={120} />);

    // Boundary segments have fixed height 28
    expect(occurrence(0).props.style.height).toBe(28);
    expect(occurrence(3).props.style.height).toBe(52);
    expect(occurrence(5).props.style.height).toBe(28);

    // Activity heights use the normalized 0-1 effort model.
    expect(occurrence(1).props.style.height).toBeCloseTo(52.8);
    expect(occurrence(2).props.style.height).toBeCloseTo(52.8);
    expect(occurrence(4).props.style.height).toBeCloseTo(100.8);
    expect(occurrence(6).props.style.height).toBe(120);

    expect(screen.getByTestId("timeline-chart").props.style.width).toBe("100%");
    for (let i = 0; i < 7; i++) {
      expect(occurrence(i).props.style.flexBasis).toBe(0);
      expect(occurrence(i).props.style.flexGrow).toBeGreaterThan(0);
      expect(occurrence(i).props.style.minWidth).toBe(0);
    }
  });

  it("uses Core intensity colors without category labels or category stripes", () => {
    renderNative(<TimelineChart compact structure={structure} />);

    expect(occurrence(1).props.style.backgroundColor).toBe("#38bdf8");
    expect(occurrence(4).props.style.backgroundColor).toBe("#eab308");
    expect(occurrence(6).props.style.backgroundColor).toBe("#ef4444");
    expect(screen.queryByText("run")).toBeNull();
    expect(screen.queryByText("bike")).toBeNull();
    expect(screen.queryByTestId("timeline-occurrence-1-category")).toBeNull();
  });

  it("shows the adjacent sport icons and direction above transitions", () => {
    renderNative(<TimelineChart structure={structure} />);

    const transition = screen.getByTestId("timeline-transition-3");
    expect(transition.props.accessible).toBe(false);
    expect(occurrence(3).props.accessibilityLabel).toContain("Run to Bike");
    expect(screen.getByTestId("timeline-transition-3-from")).toBeTruthy();
    expect(screen.getByTestId("timeline-transition-3-arrow")).toBeTruthy();
    expect(screen.getByTestId("timeline-transition-3-to")).toBeTruthy();
  });

  it("presses the interval represented by an expanded occurrence", () => {
    const onIntervalPress = jest.fn();
    renderNative(<TimelineChart structure={structure} onIntervalPress={onIntervalPress} />);

    fireEvent.press(occurrence(1));

    expect(occurrence(1).props.accessibilityRole).toBe("button");
    expect(onIntervalPress).toHaveBeenCalledWith(id(3));
    expect(onIntervalPress).toHaveBeenCalledTimes(1);
  });

  it("marks the selected interval for assistive technology", () => {
    renderNative(<TimelineChart structure={structure} selectedIntervalId={id(3)} />);

    expect(occurrence(1).props.accessibilityState).toEqual({ selected: true });
    expect(occurrence(2).props.accessibilityState).toEqual({ selected: true });
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

    // Absolute targets scale relative to matching targets in this plan.
    expect(occurrence(0).props.style.height).toBeCloseTo(43.2);
    expect(occurrence(1).props.style.height).toBe(120);
    expect(occurrence(0).props.style.height).toBeLessThan(occurrence(1).props.style.height);

    expect(occurrence(2).props.style.height).toBeCloseTo(43.2);
    expect(occurrence(3).props.style.height).toBe(120);
    expect(occurrence(2).props.style.height).toBeLessThan(occurrence(3).props.style.height);
  });
});
