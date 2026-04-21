import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const plansState = [
  {
    id: "plan-1",
    name: "Marathon Build",
    description: "16-week progression",
    template_visibility: "private",
    sport: ["run"],
    sessions_per_week_target: 5,
    durationWeeks: { recommended: 16 },
    structure: {
      target_weekly_tss_min: 420,
      target_weekly_tss_max: 520,
      min_rest_days_per_week: 2,
      periodization_template: {
        target_date: "2026-09-21",
      },
    },
  },
] as any[];

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) => React.createElement("StackScreen", props),
  },
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  ListSkeleton: createHost("ListSkeleton"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: createHost("EmptyStateCard"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      list: {
        useQuery: () => ({
          data: plansState,
          isLoading: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
    },
  },
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronRight: createHost("ChevronRight"),
  Eye: createHost("Eye"),
  EyeOff: createHost("EyeOff"),
}));

const TrainingPlansListScreenWithBoundary = require("../training-plans-list").default;

describe("training plans list screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("navigates to the selected plan detail route", () => {
    renderNative(<TrainingPlansListScreenWithBoundary />);

    fireEvent.press(screen.getByText("Marathon Build"));
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.DETAIL("plan-1"));
  });

  it("renders the plan summary before rows", () => {
    renderNative(<TrainingPlansListScreenWithBoundary />);

    expect(screen.getByTestId("training-plans-list-summary")).toBeTruthy();
    expect(screen.getByText("1 plan")).toBeTruthy();
  });

  it("renders richer preview metadata on each plan card", () => {
    renderNative(<TrainingPlansListScreenWithBoundary />);

    expect(screen.getByText("Plan preview")).toBeTruthy();
    expect(screen.getByText("16 weeks")).toBeTruthy();
    expect(screen.getByText("5 sessions/week")).toBeTruthy();
    expect(screen.getByText("420-520 TSS")).toBeTruthy();
    expect(screen.getByText("2 rest days")).toBeTruthy();
    expect(screen.getByText(/Target Sep/)).toBeTruthy();
  });
});
