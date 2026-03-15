import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import EventDetailScreen from "../event-detail";

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
    refetch: vi.fn(),
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
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({ back: vi.fn(), replace: routerReplace }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));

vi.mock("@/components/ui/input", () => ({
  Input: createHost("Input"),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: createHost("Switch"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: createHost("Textarea"),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: createHost("DateTimePicker"),
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
      update: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
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

describe("event detail deleted record redirect", () => {
  it("uses schedule-aware query freshness for event detail", async () => {
    queryMock.mockClear();

    await act(async () => {
      TestRenderer.create(<EventDetailScreen />);
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

  it("redirects away instead of showing a transient not-found state", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<EventDetailScreen />);
    });

    expect(routerReplace).toHaveBeenCalledWith("/(internal)/(tabs)/calendar");

    const textNodes = renderer.root.findAll(
      (node: any) =>
        node.type === "Text" && typeof node.props.children === "string",
    );
    const textContent = textNodes.map((node: any) => node.props.children);

    expect(textContent).toContain("Closing event...");
    expect(textContent).not.toContain("Event not found");
  });
});
