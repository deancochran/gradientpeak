import { getProfileMetricDefinition, profileMetricTypes } from "@repo/core/athlete-inputs";
import type { ReactNode } from "react";
import React from "react";
import { createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const createMock = jest.fn();
const invalidateMock = jest.fn();
const updateMock = jest.fn();
let createPending = false;
let routeId: string | undefined;
let mockSelectOnValueChange: ((option: { label: string; value: string }) => void) | undefined;
let metric:
  | {
      metric_type: string;
      value: number;
      recorded_at: string;
      notes: string | null;
    }
  | undefined;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => ReactNode } }) =>
      React.createElement(React.Fragment, null, options.headerRight?.()),
  },
  useLocalSearchParams: () => (routeId ? { id: routeId } : {}),
  useRouter: () => ({ back: backMock }),
}));

jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: { children: ReactNode }) => children,
  FormBoundedNumberField: createHost("FormBoundedNumberField"),
  FormDateTimeField: createHost("FormDateTimeField"),
  FormTextareaField: createHost("FormTextareaField"),
  FormWeightInputField: createHost("FormWeightInputField"),
}));

jest.mock("@repo/ui/components/label", () => ({
  __esModule: true,
  Label: createHost("Label"),
}));

jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  NativeSelectScrollView: createHost("NativeSelectScrollView"),
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange: (option: { label: string; value: string }) => void;
  }) => {
    mockSelectOnValueChange = onValueChange;
    return children;
  },
  SelectContent: createHost("SelectContent"),
  SelectGroup: createHost("SelectGroup"),
  SelectItem: ({
    children,
    label,
    testID,
    value,
  }: {
    children?: ReactNode;
    label: string;
    testID: string;
    value: string;
  }) =>
    React.createElement(
      "Pressable",
      {
        onPress: () => mockSelectOnValueChange?.({ label, value }),
        testID,
      },
      children ?? label,
    ),
  SelectLabel: ({ children }: { children: ReactNode }) =>
    React.createElement("Text", null, children),
  SelectTrigger: ({ testId, ...props }: { testId: string; [key: string]: unknown }) =>
    React.createElement("SelectTrigger", { ...props, testID: testId }),
  SelectValue: createHost("SelectValue"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
  ScreenErrorFallback: () => null,
}));

jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  LoadingState: createHost("LoadingState"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ profileMetrics: { invalidate: invalidateMock } }),
    profileMetrics: {
      create: { useMutation: () => ({ isPending: createPending, mutateAsync: createMock }) },
      getById: { useQuery: () => ({ data: metric, isLoading: false }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: updateMock }) },
    },
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: "athlete-1" } }),
}));

jest.mock("@/lib/utils/formErrors", () => ({
  __esModule: true,
  handleSubmitFormError: jest.fn(),
}));

const ProfileMetricEditScreen = require("../profile-metric-edit").default;

async function chooseMetric(metricType: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(`profile-metric-type-${metricType}`));
  });
}

async function save() {
  await act(async () => {
    await screen.getByText("Save").props.onPress();
  });
}

describe("profile metric semantic pace entry", () => {
  beforeEach(() => {
    backMock.mockReset();
    createMock.mockReset().mockResolvedValue(undefined);
    createPending = false;
    invalidateMock.mockReset().mockResolvedValue(undefined);
    mockSelectOnValueChange = undefined;
    updateMock.mockReset().mockResolvedValue(undefined);
    routeId = undefined;
    metric = undefined;
  });

  it("renders every metric once in the four categorized picker groups", () => {
    renderNative(<ProfileMetricEditScreen />);

    expect(screen.getByTestId("profile-metric-type-trigger").props.accessibilityLabel).toBe(
      "Metric",
    );
    expect(screen.getByTestId("profile-metric-type-trigger").props.accessibilityHint).toContain(
      "grouped by category",
    );
    for (const category of [
      "Load Calibration",
      "Supporting Physiology",
      "Recovery",
      "Body & Aerobic",
    ]) {
      expect(screen.getByText(category)).toBeTruthy();
    }
    for (const metricType of profileMetricTypes) {
      const option = screen.getByTestId(`profile-metric-type-${metricType}`);
      expect(option.props.children).toBe(getProfileMetricDefinition(metricType).label);
    }
  });

  it("shows an edited metric type as static labeled text without a picker trigger", async () => {
    routeId = "metric-1";
    metric = {
      metric_type: "ftp",
      value: 275,
      recorded_at: "2026-07-01T08:30:00.000Z",
      notes: null,
    };

    renderNative(<ProfileMetricEditScreen />);

    expect((await screen.findByTestId("profile-metric-type-static")).props.children).toBe(
      "Bike FTP",
    );
    expect(screen.getByText("Metric")).toBeTruthy();
    expect(screen.queryByTestId("profile-metric-type-trigger")).toBeNull();
  });

  it("disables the metric picker while a create is pending", () => {
    createPending = true;

    renderNative(<ProfileMetricEditScreen />);

    expect(screen.getByTestId("profile-metric-type-trigger").props.disabled).toBe(true);
  });

  it("uses the threshold default and submits canonical seconds", async () => {
    renderNative(<ProfileMetricEditScreen />);
    await chooseMetric("threshold_pace_seconds_per_km");

    const input = screen.getByTestId("profile-metric-value");
    expect(input.props.value).toBe("4:30");
    expect(screen.getByText("/km")).toBeTruthy();

    fireEvent.changeText(input, "4:45");
    await save();

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metric_type: "threshold_pace_seconds_per_km",
          notes: null,
          profile_id: "athlete-1",
          value: 285,
        }),
      ),
    );
    expect(createMock.mock.calls[0]?.[0].recorded_at).toEqual(expect.any(String));
  });

  it("uses the CSS default and semantic unit", async () => {
    renderNative(<ProfileMetricEditScreen />);
    await chooseMetric("css_seconds_per_100m");

    expect(screen.getByTestId("profile-metric-value").props.value).toBe("1:40");
    expect(screen.getByText("/100m")).toBeTruthy();
  });

  it("hydrates and submits an edited threshold pace as canonical seconds", async () => {
    routeId = "metric-1";
    metric = {
      metric_type: "threshold_pace_seconds_per_km",
      value: 305,
      recorded_at: "2026-07-01T08:30:00.000Z",
      notes: "Track test",
    };

    renderNative(<ProfileMetricEditScreen />);

    const input = await screen.findByTestId("profile-metric-value");
    expect(input.props.value).toBe("5:05");
    fireEvent.changeText(input, "5:10");
    await save();

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: "metric-1",
        notes: "Track test",
        recorded_at: "2026-07-01T08:30:00.000Z",
        value: 310,
      }),
    );
  });

  it("resets to each metric's canonical default when switching", async () => {
    renderNative(<ProfileMetricEditScreen />);
    await chooseMetric("threshold_pace_seconds_per_km");
    fireEvent.changeText(screen.getByTestId("profile-metric-value"), "5:00");

    await chooseMetric("css_seconds_per_100m");
    expect(screen.getByTestId("profile-metric-value").props.value).toBe("1:40");

    await chooseMetric("threshold_pace_seconds_per_km");
    expect(screen.getByTestId("profile-metric-value").props.value).toBe("4:30");
  });

  it("does not submit an incomplete pace draft and retains it for correction", async () => {
    renderNative(<ProfileMetricEditScreen />);
    await chooseMetric("threshold_pace_seconds_per_km");

    fireEvent.changeText(screen.getByTestId("profile-metric-value"), "4:3");
    await save();

    expect(createMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("profile-metric-value").props.value).toBe("4:3");
    expect(screen.getByTestId("profile-metric-value").props.accessibilityHint).toContain(
      "Error: Value is required",
    );
    expect(screen.getByText("Adjust this field: Value is required")).toBeTruthy();
  });

  it.each([
    "1:59",
    "20:01",
  ])("rejects threshold pace %s outside the canonical range", async (pace) => {
    renderNative(<ProfileMetricEditScreen />);
    await chooseMetric("threshold_pace_seconds_per_km");
    fireEvent.changeText(screen.getByTestId("profile-metric-value"), pace);
    await save();

    expect(
      await screen.findByText(
        "Adjust this field: Running threshold pace must be between 2:00 and 20:00 /km",
      ),
    ).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });
});
