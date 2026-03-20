import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import ScheduledActivityDetailScreen from "../scheduled-activity-detail";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const { routerReplace, queryMock } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  queryMock: vi.fn(() => ({
    data: null,
    error: { data: { code: "NOT_FOUND" } },
    isLoading: false,
  })),
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: vi.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: routerReplace }),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/ScheduleActivityModal", () => ({
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { setSelection: vi.fn() },
}));

vi.mock("@/lib/utils/plan/colors", () => ({
  getActivityBgClass: () => "bg-primary",
  getActivityColor: () => ({ name: "Run" }),
}));

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: () => false,
}));

vi.mock("lucide-react-native", () => ({
  Calendar: "Calendar",
  CheckCircle2: "CheckCircle2",
  Clock: "Clock",
  Edit: "Edit",
  Play: "Play",
  Trash2: "Trash2",
  Zap: "Zap",
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      events: {
        list: { invalidate: vi.fn() },
        getToday: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
      trainingPlans: {
        invalidate: vi.fn(),
      },
    }),
    events: {
      getById: {
        useQuery: queryMock,
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
    },
  },
}));

describe("scheduled activity detail deleted record redirect", () => {
  it("uses schedule-aware query freshness for scheduled activity detail", async () => {
    queryMock.mockClear();

    await act(async () => {
      TestRenderer.create(<ScheduledActivityDetailScreen />);
    });

    expect(queryMock).toHaveBeenCalledWith(
      { id: "event-1" },
      expect.objectContaining({
        enabled: true,
        staleTime: 0,
        refetchOnMount: "always",
      }),
    );
  });

  it("redirects away instead of rendering the not-found state", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ScheduledActivityDetailScreen />);
    });

    expect(routerReplace).toHaveBeenCalledWith("/(internal)/(tabs)/calendar");

    const textNodes = renderer.root.findAll(
      (node: any) =>
        node.type === "Text" && typeof node.props.children === "string",
    );
    const textContent = textNodes.map((node: any) => node.props.children);

    expect(textContent).toContain("Closing activity...");
    expect(textContent).not.toContain("Activity Not Found");
  });
});
