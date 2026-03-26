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
  },
] as any[];

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
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

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
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

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
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
  Plus: createHost("Plus"),
}));

const TrainingPlansListScreenWithBoundary = require("../training-plans-list").default;

describe("training plans list screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("navigates to create and detail routes", () => {
    renderNative(<TrainingPlansListScreenWithBoundary />);

    fireEvent.press(screen.getByText("Create Training Plan"));
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);

    fireEvent.press(screen.getByText("Marathon Build"));
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.DETAIL("plan-1"));
  });
});
