import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import TrainingPlansListScreenWithBoundary from "../training-plans-list";

const { pushMock, plansState } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  plansState: [
    {
      id: "plan-1",
      name: "Marathon Build",
      description: "16-week progression",
      template_visibility: "private",
    },
  ] as any[],
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@repo/ui/components/loading-skeletons", () => ({
  ListSkeleton: createHost("ListSkeleton"),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

vi.mock("@repo/ui/components/empty-state-card", () => ({
  EmptyStateCard: createHost("EmptyStateCard"),
}));

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("lucide-react-native", () => ({
  ChevronRight: createHost("ChevronRight"),
  Eye: createHost("Eye"),
  EyeOff: createHost("EyeOff"),
  Plus: createHost("Plus"),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    trainingPlans: {
      list: {
        useQuery: () => ({
          data: plansState,
          isLoading: false,
          refetch: vi.fn(async () => undefined),
        }),
      },
    },
  },
}));

describe("training plans list screen", () => {
  it("navigates to create and detail routes", () => {
    pushMock.mockReset();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TrainingPlansListScreenWithBoundary />);
    });

    const buttons = renderer.root.findAll((node: any) => node.type === "Button");
    const createButton = buttons.find((node: any) => {
      const textNode = node.findAll((child: any) => child.type === "Text")[0];
      return textNode?.props?.children === "Create Training Plan";
    });

    expect(createButton).toBeDefined();

    act(() => {
      createButton!.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);

    const planCardPressables = renderer.root.findAll(
      (node: any) => node.type === "TouchableOpacity" && typeof node.props.onPress === "function",
    );

    act(() => {
      planCardPressables[0].props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.DETAIL("plan-1"));
  });
});
