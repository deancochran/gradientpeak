import {
  getProfileMetricDefinition,
  isActivityDerivedThresholdMetricType,
  profileMetricTypes,
} from "@repo/core/athlete-inputs";
import type { ReactNode } from "react";
import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

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
    for (const metricType of profileMetricTypes.filter(
      (candidate) => !isActivityDerivedThresholdMetricType(candidate),
    )) {
      const option = screen.getByTestId(`profile-metric-type-${metricType}`);
      expect(option.props.children).toBe(getProfileMetricDefinition(metricType).label);
    }
    expect(screen.queryByTestId("profile-metric-type-ftp")).toBeNull();
    expect(screen.queryByTestId("profile-metric-type-lthr")).toBeNull();
  });

  it("shows an existing threshold as read-only", async () => {
    routeId = "metric-1";
    metric = {
      metric_type: "ftp",
      value: 275,
      recorded_at: "2026-07-01T08:30:00.000Z",
      notes: null,
    };

    renderNative(<ProfileMetricEditScreen />);

    expect(await screen.findByText("Read-only threshold")).toBeTruthy();
    expect(screen.getByText(/calculated from trusted recorded activity evidence/)).toBeTruthy();
    expect(screen.queryByTestId("profile-metric-type-trigger")).toBeNull();
  });

  it("disables the metric picker while a create is pending", () => {
    createPending = true;

    renderNative(<ProfileMetricEditScreen />);

    expect(screen.getByTestId("profile-metric-type-trigger").props.disabled).toBe(true);
  });
});
