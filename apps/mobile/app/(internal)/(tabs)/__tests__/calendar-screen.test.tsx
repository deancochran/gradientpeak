import { format } from "date-fns";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarScreenWithErrorBoundary from "../calendar";

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const { pushMock, replaceMock, openRouteMock, setSelectionMock, today } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  openRouteMock: vi.fn(() => "/event/event-1"),
  setSelectionMock: vi.fn(),
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
              <React.Fragment key={item.key ?? `${section.dateKey}-${itemIndex}`}>
                {props.renderItem?.({ item, section, index: itemIndex }) ?? null}
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
}));

vi.mock("@repo/ui/components/loading-skeletons", () => ({
  PlanCalendarSkeleton: createHost("PlanCalendarSkeleton"),
}));

vi.mock("@/components/ScheduleActivityModal", () => ({
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@repo/ui/components/input", () => ({
  Input: createHost("Input"),
}));

vi.mock("@repo/ui/components/switch", () => ({
  Switch: createHost("Switch"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@repo/ui/components/textarea", () => ({
  Textarea: createHost("Textarea"),
}));

vi.mock("lucide-react-native", () => ({
  ArrowUpRight: createHost("ArrowUpRight"),
  CalendarDays: createHost("CalendarDays"),
  CheckCircle2: createHost("CheckCircle2"),
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
  Clock3: createHost("Clock3"),
  Flag: createHost("Flag"),
  Lock: createHost("Lock"),
  MoonStar: createHost("MoonStar"),
  Pencil: createHost("Pencil"),
  Play: createHost("Play"),
  Plus: createHost("Plus"),
  Repeat2: createHost("Repeat2"),
  Search: createHost("Search"),
  Zap: createHost("Zap"),
}));

vi.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { setSelection: setSelectionMock },
}));

vi.mock("@/lib/constants/routes", () => ({
  ROUTES: { RECORD: "/record" },
}));

vi.mock("@/lib/utils/plan/colors", () => ({
  getActivityColor: (type?: string) => ({
    name: type === "outdoor_run" ? "Outdoor Run" : "Other",
    bg: "bg-orange-500",
    text: "text-orange-600",
    iconBg: "bg-orange-500",
  }),
}));

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: (activity: any) => activity?.completed === true,
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
              {
                id: "event-2",
                event_type: "planned",
                title: "Tempo Builder",
                scheduled_date: today,
                starts_at: `${today}T06:30:00.000Z`,
                all_day: false,
                completed: false,
                activity_plan: {
                  id: "plan-1",
                  name: "Tempo Builder",
                  activity_category: "outdoor_run",
                  estimated_duration: 3600,
                  estimated_tss: 72,
                },
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

    expect(renderer.root.findByProps({ testID: "create-event-entry" })).toBeDefined();
    expect(renderer.root.findByProps({ testID: `schedule-event-event-1` })).toBeDefined();

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        if (Array.isArray(value)) {
          return value.join("");
        }
        return typeof value === "string" ? value : "";
      });
    const combinedText = textValues.join(" ");

    expect(textValues).toContain(format(new Date(`${today}T00:00:00.000Z`), "MMMM yyyy"));
    expect(renderer.root.findByProps({ testID: `calendar-week-day-${today}` })).toBeDefined();
    expect(renderer.root.findAllByProps({ testID: `calendar-gap-${today}` }).length).toBe(0);
    expect(
      renderer.root.findAll((node: any) =>
        String(node.props?.testID || "").startsWith("calendar-gap-"),
      ).length,
    ).toBeGreaterThan(0);
    expect(combinedText).toContain("From Plan");
    expect(combinedText).toContain("72 TSS");
    expect(combinedText).toContain("Start");
    expect(combinedText).toContain("Next event");
    expect(textValues).not.toContain("Open Full Plan");
    expect(textValues).not.toContain("No Training Plan");
    expect(textValues).not.toContain("Up Next");
  });

  it("updates focused day when another day is selected from the week strip", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().split("T")[0]!;

    const tomorrowButton = renderer.root.findByProps({
      testID: `calendar-week-day-${tomorrowKey}`,
    });

    act(() => {
      tomorrowButton.props.onPress();
    });

    const expectedLabel = format(new Date(`${tomorrowKey}T00:00:00.000Z`), "EEEE, MMM d");

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => node.props.children)
      .flat()
      .filter((value: unknown): value is string => typeof value === "string");

    expect(textValues).toContain(expectedLabel);
  });

  it("shows a guided empty-day state when selecting an unscheduled day", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().split("T")[0]!;

    const tomorrowButton = renderer.root.findByProps({
      testID: `calendar-week-day-${tomorrowKey}`,
    });

    act(() => {
      tomorrowButton.props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: `calendar-empty-day-${tomorrowKey}` }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: `calendar-empty-create-${tomorrowKey}` }),
    ).toBeDefined();
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

  it("starts a planned activity from the row quick action", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    const actionButton = renderer.root.findByProps({
      testID: "schedule-event-action-event-2",
    });

    await act(async () => {
      actionButton.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(setSelectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "outdoor_run",
        eventId: "event-2",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/record");
  });

  it("opens a direct planned-activity scheduling flow from calendar", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<CalendarScreenWithErrorBoundary />);
    });

    act(() => {
      renderer.root.findByProps({ testID: "create-event-entry" }).props.onPress();
    });

    act(() => {
      renderer.root.findByProps({ testID: "create-type-planned" }).props.onPress();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    const planOption = renderer.root.findByProps({
      testID: "calendar-planned-activity-option-plan-1",
    });

    act(() => {
      planOption.props.onPress();
    });

    const scheduleModal = renderer.root.find((node: any) => node.type === "ScheduleActivityModal");

    expect(scheduleModal.props.activityPlanId).toBe("plan-1");
    expect(scheduleModal.props.preselectedDate).toBe(today);
  });
});
