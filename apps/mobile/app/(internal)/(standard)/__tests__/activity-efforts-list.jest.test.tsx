import React from "react";
import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
type ActivityEffort = {
  id: string;
  activity_id: string | null;
  activity_category: string;
  effort_type: string;
  recorded_at: string;
  duration_seconds: number;
  value: number;
  unit: string;
  source?: string | null;
  method?: string | null;
  provenance?: unknown;
};

function trustedImportedObservation(activityId: string) {
  return {
    activity_id: activityId,
    source: "imported",
    method: "activity_file_best_effort",
    provenance: { derived_from: "activity_file_stream", activity_id: activityId },
  };
}

let mockActivityEfforts: ActivityEffort[] = [
  {
    id: "effort-1",
    ...trustedImportedObservation("activity-1"),
    activity_category: "bike",
    effort_type: "power",
    recorded_at: "2026-03-01T00:00:00.000Z",
    duration_seconds: 15,
    value: 800,
    unit: "W",
  },
  {
    id: "effort-2",
    ...trustedImportedObservation("activity-2"),
    activity_category: "bike",
    effort_type: "power",
    recorded_at: "2026-03-02T00:00:00.000Z",
    duration_seconds: 60,
    value: 500,
    unit: "W",
  },
  {
    id: "effort-3",
    ...trustedImportedObservation("activity-3"),
    activity_category: "bike",
    effort_type: "power",
    recorded_at: "2026-03-03T00:00:00.000Z",
    duration_seconds: 300,
    value: 350,
    unit: "W",
  },
  {
    id: "effort-4",
    ...trustedImportedObservation("activity-4"),
    activity_category: "bike",
    effort_type: "power",
    recorded_at: "2026-03-04T00:00:00.000Z",
    duration_seconds: 1200,
    value: 280,
    unit: "W",
  },
  {
    id: "effort-5",
    ...trustedImportedObservation("activity-5"),
    activity_category: "bike",
    effort_type: "power",
    recorded_at: "2026-03-05T00:00:00.000Z",
    duration_seconds: 3600,
    value: 220,
    unit: "W",
  },
];

type FlatListProps = {
  data?: ActivityEffort[];
  renderItem: (args: { item: ActivityEffort }) => React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  [key: string]: unknown;
};

type CompactInsightCardProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  title?: string;
  value?: string;
};

type DetailChartModalProps = {
  children: (range: string) => React.ReactNode;
  title?: string;
  visible?: boolean;
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: mockCreateHost("StackScreen") },
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: FlatListProps) =>
    React.createElement(
      "FlatList",
      props,
      data?.length ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
    ),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: mockCreateHost("Svg"),
  Circle: mockCreateHost("Circle"),
  Line: mockCreateHost("Line"),
  Path: mockCreateHost("Path"),
  Text: mockCreateHost("Text"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: mockCreateHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  CompactInsightCard: ({ children, onPress, testID, title, value }: CompactInsightCardProps) =>
    React.createElement(
      "Pressable",
      { onPress, testID },
      React.createElement("Text", null, title),
      React.createElement("Text", null, value),
      children,
    ),
  DetailChartModal: ({ children, title, visible }: DetailChartModalProps) =>
    visible
      ? React.createElement("View", null, React.createElement("Text", null, title), children("all"))
      : null,
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityEfforts: {
      getForProfile: {
        useQuery: () => ({
          data: mockActivityEfforts,
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: mockCreateHost("Activity"),
  ChevronRight: mockCreateHost("ChevronRight"),
  Timer: mockCreateHost("Timer"),
  Zap: mockCreateHost("Zap"),
}));

const {
  default: ActivityEffortsList,
  getEffortChartCoordinates,
} = require("../activity-efforts-list");

describe("activity efforts list", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockActivityEfforts = [
      {
        id: "effort-1",
        ...trustedImportedObservation("activity-1"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-01T00:00:00.000Z",
        duration_seconds: 15,
        value: 800,
        unit: "W",
      },
      {
        id: "effort-2",
        ...trustedImportedObservation("activity-2"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-02T00:00:00.000Z",
        duration_seconds: 60,
        value: 500,
        unit: "W",
      },
      {
        id: "effort-3",
        ...trustedImportedObservation("activity-3"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-03T00:00:00.000Z",
        duration_seconds: 300,
        value: 350,
        unit: "W",
      },
      {
        id: "effort-4",
        ...trustedImportedObservation("activity-4"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-04T00:00:00.000Z",
        duration_seconds: 1200,
        value: 280,
        unit: "W",
      },
      {
        id: "effort-5",
        ...trustedImportedObservation("activity-5"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-05T00:00:00.000Z",
        duration_seconds: 3600,
        value: 220,
        unit: "W",
      },
    ];
  });

  it("opens a power curve sheet when tapping the curve card", () => {
    renderNative(<ActivityEffortsList />);

    fireEvent.press(screen.getByTestId("activity-effort-curve-bike_power"));

    expect(screen.getAllByText("Bike power curve").length).toBeGreaterThan(0);
  });

  it("presents swim speed as pace per 100 meters", () => {
    mockActivityEfforts = [
      {
        id: "swim-effort",
        ...trustedImportedObservation("swim-activity"),
        activity_category: "swim",
        effort_type: "speed",
        recorded_at: "2026-03-05T00:00:00.000Z",
        duration_seconds: 1200,
        value: 1,
        unit: "meters_per_second",
      },
    ];

    renderNative(<ActivityEffortsList />);

    expect(screen.getByText("Best 1:40/100m")).toBeTruthy();
  });

  it("shows nonlinear effort duration ticks across sprint, tempo, and endurance", () => {
    renderNative(<ActivityEffortsList />);

    fireEvent.press(screen.getByTestId("activity-effort-curve-bike_power"));

    expect(screen.getByText("15s")).toBeTruthy();
    expect(screen.getByText("5m 00s")).toBeTruthy();
    expect(screen.getByText("20m 00s")).toBeTruthy();
    expect(screen.getByText("1h 00m")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.queryByText("Speed (W)")).toBeNull();
  });

  it("preserves a historical derived effort without treating it as observed", () => {
    mockActivityEfforts = [
      ...mockActivityEfforts,
      {
        id: "historical-derived-4240",
        activity_id: null,
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2025-01-01T00:00:00.000Z",
        duration_seconds: 3600,
        value: 4240,
        unit: "W",
        source: "derived",
        method: "onboarding_modeled_curve",
        provenance: { observation_type: "modeled", seed_source: "onboarding" },
      },
    ];

    renderNative(<ActivityEffortsList />);

    expect(screen.getByText("Best 800 W")).toBeTruthy();
    fireEvent.press(screen.getByTestId("activity-effort-curve-bike_power"));

    expect(screen.getAllByText("Best 800 W").length).toBeGreaterThan(0);
    expect(screen.getByText("846 W")).toBeTruthy();
    expect(screen.getByText("4240 W")).toBeTruthy();
    expect(screen.getByText("Modeled threshold")).toBeTruthy();
  });

  it("keeps implausible raw records visible with review and invalid labels", () => {
    mockActivityEfforts = [
      ...mockActivityEfforts,
      {
        id: "review-effort",
        ...trustedImportedObservation("activity-review"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-06T00:00:00.000Z",
        duration_seconds: 3600,
        value: 700,
        unit: "W",
      },
      {
        id: "invalid-effort",
        ...trustedImportedObservation("activity-invalid"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-07T00:00:00.000Z",
        duration_seconds: 60,
        value: 0,
        unit: "W",
      },
    ];

    renderNative(<ActivityEffortsList />);
    fireEvent.press(screen.getByTestId("activity-effort-curve-bike_power"));

    expect(screen.getByText("700 W")).toBeTruthy();
    expect(screen.getByText("Review effort")).toBeTruthy();
    expect(screen.getByText("0 W")).toBeTruthy();
    expect(screen.getByText("Invalid effort")).toBeTruthy();
    expect(screen.getAllByText("Best 800 W").length).toBeGreaterThan(0);
    expect(screen.getByText("846 W")).toBeTruthy();
  });

  it("shows speed on the horizontal axis and duration on the vertical axis", () => {
    mockActivityEfforts = [
      {
        id: "run-effort-1",
        ...trustedImportedObservation("activity-run-1"),
        activity_category: "run",
        effort_type: "speed",
        recorded_at: "2026-03-01T00:00:00.000Z",
        duration_seconds: 60,
        value: 5,
        unit: "m/s",
      },
      {
        id: "run-effort-2",
        ...trustedImportedObservation("activity-run-2"),
        activity_category: "run",
        effort_type: "speed",
        recorded_at: "2026-03-02T00:00:00.000Z",
        duration_seconds: 300,
        value: 4,
        unit: "m/s",
      },
      {
        id: "run-effort-3",
        ...trustedImportedObservation("activity-run-3"),
        activity_category: "run",
        effort_type: "speed",
        recorded_at: "2026-03-03T00:00:00.000Z",
        duration_seconds: 600,
        value: 3,
        unit: "m/s",
      },
    ];

    renderNative(<ActivityEffortsList />);
    fireEvent.press(screen.getByTestId("activity-effort-curve-run_speed"));

    expect(screen.getByText("Speed (m/s)")).toBeTruthy();
    expect(screen.getByText("Duration").props.transform).toContain("rotate(-90");
    expect(screen.getByText("1m 00s")).toBeTruthy();
    expect(screen.getByText("10m 00s")).toBeTruthy();
  });

  it("maps chart coordinates according to the selected modality orientation", () => {
    const points = [
      { effortId: "fast", label: "1m 00s", duration: 60, value: 5 },
      { effortId: "endurance", label: "10m 00s", duration: 600, value: 3 },
    ];
    const bounds = { minDuration: 60, maxDuration: 600, minValue: 3, maxValue: 5 };
    const padding = { top: 0, right: 0, bottom: 0, left: 0 };

    expect(getEffortChartCoordinates(points, 100, 100, padding, bounds)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(
      getEffortChartCoordinates(points, 100, 100, padding, bounds, "duration-vertical"),
    ).toEqual([
      { x: 100, y: 100 },
      { x: 0, y: 0 },
    ]);

    const invalidCoordinates = getEffortChartCoordinates(
      [{ effortId: "invalid", label: "", duration: Number.NaN, value: Number.POSITIVE_INFINITY }],
      100,
      100,
      padding,
      bounds,
      "duration-vertical",
    );
    expect(Number.isFinite(invalidCoordinates[0]?.x)).toBe(true);
    expect(Number.isFinite(invalidCoordinates[0]?.y)).toBe(true);
  });

  it("does not force beginner-length efforts onto a one-hour x-axis", () => {
    mockActivityEfforts = [
      {
        id: "effort-short-1",
        ...trustedImportedObservation("activity-short-1"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-01T00:00:00.000Z",
        duration_seconds: 60,
        value: 180,
        unit: "W",
      },
      {
        id: "effort-short-2",
        ...trustedImportedObservation("activity-short-2"),
        activity_category: "bike",
        effort_type: "power",
        recorded_at: "2026-03-02T00:00:00.000Z",
        duration_seconds: 300,
        value: 140,
        unit: "W",
      },
    ];

    renderNative(<ActivityEffortsList />);
    fireEvent.press(screen.getByTestId("activity-effort-curve-bike_power"));

    expect(screen.getByText("1m 00s")).toBeTruthy();
    expect(screen.getByText("5m 00s")).toBeTruthy();
    expect(screen.queryByText("1h 00m")).toBeNull();
  });

  it("shows an empty state when no efforts have been saved", () => {
    mockActivityEfforts = [];

    renderNative(<ActivityEffortsList />);

    expect(screen.getByTestId("activity-efforts-empty-state")).toBeTruthy();
    expect(screen.getByText("No efforts yet")).toBeTruthy();
  });
});
