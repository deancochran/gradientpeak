import { format } from "date-fns";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarScreenWithErrorBoundary from "../calendar";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const { pushMock, replaceMock, openRouteMock, today } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  openRouteMock: vi.fn(() => "/event/event-1"),
  today: new Date().toISOString().split("T")[0]!,
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function createModalHost(type: string) {
  return function MockModal(props: any) {
    if (!props.visible) {
      return null;
    }

    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => {
  const SectionList = (props: any) => {
    const sections = props.sections ?? [];
    return React.createElement(
      "SectionList",
      props,
      <>
        {props.ListHeaderComponent ?? null}
        {sections.map((section: any) => (
          <React.Fragment key={section.dateKey || section.title}>
            {props.renderSectionHeader?.({ section }) ?? null}
            {(section.data || []).map((item: any, itemIndex: number) => (
              <React.Fragment
                key={item.key ?? `${section.dateKey}-${itemIndex}`}
              >
                {props.renderItem?.({ item, section, index: itemIndex }) ??
                  null}
              </React.Fragment>
            ))}
          </React.Fragment>
        ))}
      </>,
    );
  };

  return {
    ActivityIndicator: createHost("ActivityIndicator"),
    Alert: { alert: vi.fn() },
    Modal: createModalHost("Modal"),
    Pressable: createHost("Pressable"),
    RefreshControl: createHost("RefreshControl"),
    ScrollView: createHost("ScrollView"),
    SectionList,
    TouchableOpacity: createHost("TouchableOpacity"),
    View: createHost("View"),
  };
});

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: createHost("DateTimePicker"),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/shared", () => ({
  AppHeader: createHost("AppHeader"),
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));

vi.mock("@/components/ScheduleActivityModal", () => ({
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
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

vi.mock("lucide-react-native", () => ({
  CalendarDays: createHost("CalendarDays"),
  ChevronRight: createHost("ChevronRight"),
  Clock3: createHost("Clock3"),
  Play: createHost("Play"),
  Plus: createHost("Plus"),
  Search: createHost("Search"),
}));

vi.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { setSelection: vi.fn() },
}));

vi.mock("@/lib/navigation/useNavigationActionGuard", () => ({
  useNavigationActionGuard: () => (navigate: () => void) => navigate(),
}));

vi.mock("@/lib/calendar/eventRouting", () => ({
  buildEditEventRoute: vi.fn(() => "/edit/event-1"),
  buildOpenEventRoute: openRouteMock,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      events: { invalidate: vi.fn(async () => undefined) },
    }),
    events: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "event-1",
                event_type: "custom",
                title: "Track workout",
                scheduled_date: today,
                starts_at: `${today}T09:00:00.000Z`,
                all_day: false,
                notes: null,
              },
            ],
          },
          isLoading: false,
          refetch: vi.fn(async () => undefined),
        }),
      },
      create: {
        useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "plan-1",
                name: "Tempo Builder",
                activity_category: "outdoor_run",
                estimated_duration: 3600,
                estimated_tss: 72,
              },
            ],
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(async () => undefined),
        }),
      },
    },
  },
}));

describe("calendar day scroller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders full-screen day sections without legacy plan cards", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    expect(
      renderer.root.findByProps({ testID: "create-event-entry" }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: `schedule-event-event-1` }),
    ).toBeDefined();

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        if (Array.isArray(value)) {
          return value.join("");
        }
        return typeof value === "string" ? value : "";
      });

    expect(textValues).toContain("Focus Day");
    expect(textValues).not.toContain("Open Full Plan");
    expect(textValues).not.toContain("No Training Plan");
    expect(textValues).not.toContain("Up Next");
  });

  it("updates focused day when another day header is pressed", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().split("T")[0]!;

    const tomorrowHeader = renderer.root.findAllByProps({
      testID: `day-header-${tomorrowKey}`,
    })[0];

    act(() => {
      tomorrowHeader.props.onPress();
    });

    const expectedLabel = format(
      new Date(`${tomorrowKey}T00:00:00.000Z`),
      "EEEE, MMM d",
    );

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => node.props.children)
      .flat()
      .filter((value: unknown): value is string => typeof value === "string");

    expect(textValues).toContain(expectedLabel);
  });

  it("navigates directly to routed event detail on tap", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    const eventRow = renderer.root.findByProps({
      testID: "schedule-event-event-1",
    });

    await act(async () => {
      eventRow.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(openRouteMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/event/event-1");
  });

  it("opens a direct planned-activity scheduling flow from calendar", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    act(() => {
      renderer.root
        .findByProps({ testID: "create-event-entry" })
        .props.onPress();
    });

    act(() => {
      renderer.root
        .findByProps({ testID: "create-type-planned" })
        .props.onPress();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    const planOption = renderer.root.findByProps({
      testID: "calendar-planned-activity-option-plan-1",
    });

    act(() => {
      planOption.props.onPress();
    });

    const scheduleModal = renderer.root.find(
      (node: any) => node.type === "ScheduleActivityModal",
    );

    expect(scheduleModal.props.activityPlanId).toBe("plan-1");
    expect(scheduleModal.props.preselectedDate).toBe(today);
  });
});
