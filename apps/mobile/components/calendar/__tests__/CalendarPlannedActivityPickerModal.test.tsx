import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPlannedActivityPickerModal } from "../CalendarPlannedActivityPickerModal";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function getTextContent(children: any): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((child) => getTextContent(child)).join("");
  if (children?.props?.children !== undefined) return getTextContent(children.props.children);
  return "";
}

const { activityPlansState } = vi.hoisted(() => ({
  activityPlansState: {
    items: [] as any[],
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Modal: ({ visible, children, ...props }: any) =>
    visible ? React.createElement("Modal", props, children) : null,
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@repo/ui/components/input", () => ({
  Input: createHost("Input"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("lucide-react-native", () => ({
  ChevronRight: createHost("ChevronRight"),
  Clock3: createHost("Clock3"),
  Heart: createHost("Heart"),
  Search: createHost("Search"),
  Sparkles: createHost("Sparkles"),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    activityPlans: {
      list: {
        useQuery: () => ({
          data: { items: activityPlansState.items },
          isLoading: activityPlansState.isLoading,
          error: activityPlansState.error,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

describe("CalendarPlannedActivityPickerModal", () => {
  beforeEach(() => {
    activityPlansState.items = [
      {
        id: "favorite-1",
        name: "Favorite Long Run",
        activity_category: "outdoor_run",
        estimated_duration: 5400,
        estimated_tss: 90,
        description: "Steady aerobic long run.",
        likes_count: 3,
        has_liked: true,
        updated_at: "2026-03-10T00:00:00.000Z",
      },
      {
        id: "recent-1",
        name: "Recent Tempo",
        activity_category: "outdoor_run",
        estimated_duration: 3600,
        estimated_tss: 78,
        updated_at: "2026-03-21T00:00:00.000Z",
      },
      {
        id: "recent-2",
        name: "Recent Bike Build",
        activity_category: "outdoor_bike",
        estimated_duration: 4200,
        estimated_tss: 82,
        updated_at: "2026-03-20T00:00:00.000Z",
      },
      {
        id: "recent-3",
        name: "Recent Swim",
        activity_category: "indoor_swim",
        estimated_duration: 2400,
        estimated_tss: 45,
        updated_at: "2026-03-19T00:00:00.000Z",
      },
      {
        id: "recent-4",
        name: "Recent Strength",
        activity_category: "indoor_strength",
        estimated_duration: 1800,
        estimated_tss: 30,
        updated_at: "2026-03-18T00:00:00.000Z",
      },
      {
        id: "suggested-1",
        name: "Threshold Builder",
        activity_category: "outdoor_run",
        estimated_duration: 4500,
        estimated_tss: 95,
        description: "Sharp threshold progression.",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "suggested-2",
        name: "VO2 Session",
        activity_category: "outdoor_run",
        estimated_duration: 3900,
        estimated_tss: 92,
        updated_at: "2026-02-28T00:00:00.000Z",
      },
      {
        id: "suggested-3",
        name: "Brick Builder",
        activity_category: "outdoor_bike",
        estimated_duration: 4800,
        estimated_tss: 88,
        updated_at: "2026-02-27T00:00:00.000Z",
      },
      {
        id: "suggested-4",
        name: "Progressive Climb",
        activity_category: "outdoor_bike",
        estimated_duration: 5100,
        estimated_tss: 84,
        updated_at: "2026-02-26T00:00:00.000Z",
      },
      {
        id: "all-1",
        name: "Easy Recovery Spin",
        activity_category: "outdoor_bike",
        estimated_duration: 2400,
        estimated_tss: 28,
        updated_at: "2026-02-20T00:00:00.000Z",
      },
    ];
    activityPlansState.isLoading = false;
    activityPlansState.error = null;
  });

  it("renders browse-oriented sections and category filters", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <CalendarPlannedActivityPickerModal
          visible
          selectedDate="2026-03-21"
          onClose={vi.fn()}
          onSelectPlan={vi.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: "calendar-planned-activity-section-suggested" }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: "calendar-planned-activity-section-recent" }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: "calendar-planned-activity-section-favorites" }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: "calendar-planned-activity-filter-all" }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: "calendar-planned-activity-filter-outdoor_run" }),
    ).toBeDefined();
  });

  it("supports category filtering and search-driven results", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <CalendarPlannedActivityPickerModal
          visible
          selectedDate="2026-03-21"
          onClose={vi.fn()}
          onSelectPlan={vi.fn()}
        />,
      );
    });

    act(() => {
      renderer.root
        .findByProps({ testID: "calendar-planned-activity-filter-outdoor_run" })
        .props.onPress();
    });

    let combinedText = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getTextContent(node.props.children))
      .join(" ");

    expect(combinedText).toContain("Threshold Builder");
    expect(combinedText).not.toContain("Easy Recovery Spin");

    act(() => {
      renderer.root.findByProps({ testID: "calendar-planned-activity-filter-all" }).props.onPress();
    });

    act(() => {
      renderer.root
        .findByProps({ testID: "calendar-planned-activity-search" })
        .props.onChangeText("Brick");
    });

    expect(
      renderer.root.findByProps({ testID: "calendar-planned-activity-section-search-results" }),
    ).toBeDefined();

    combinedText = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getTextContent(node.props.children))
      .join(" ");

    expect(combinedText).toContain("Brick Builder");
  });
});
