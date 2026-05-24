import { act } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

const createEventMutateMock = jest.fn();
const mockActivityPlansListUseQuery: jest.Mock = jest.fn(() => ({
  data: { items: [] },
  isLoading: false,
  error: null,
  refetch: jest.fn(),
}));
const mockActivityPlanGetByIdUseQuery: jest.Mock = jest.fn(() => ({
  data: null,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
}));
let paramsState: Record<string, string | undefined> = { mode: "create", date: "2026-03-24" };

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => paramsState,
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@/components/event/EventEditorCard", () => ({
  __esModule: true,
  buildCreateStartsAt: (date?: string) => new Date(`${date ?? "2026-03-24"}T12:00:00.000Z`),
  buildRecurrenceFromFrequency: (frequency: string, endDate: string | null) =>
    frequency === "none" ? undefined : { frequency, endDate },
  parseRecurrenceEndDate: (event: any) => event?.recurrence?.endDate ?? null,
  parseRecurrenceFrequency: (event: any) => event?.recurrence?.frequency ?? "none",
}));

jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanSummary: createHost("ActivityPlanSummary"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: ({ onClose, onSelect, visible }: any) => {
    if (!visible) return null;
    const React = require("react");
    const data = mockActivityPlansListUseQuery().data;
    const items = data?.items ?? [];
    return React.createElement(
      "ResourcePickerModal",
      { visible },
      React.createElement("Input", { testID: "event-detail-activity-plan-search-input" }),
      ...items.map((item: any) =>
        React.createElement(
          "Button",
          {
            key: item.id,
            onPress: () => onSelect(item),
            testID: `event-detail-activity-plan-option-${item.id}`,
          },
          item.name,
        ),
      ),
      React.createElement("Button", {
        onPress: onClose,
        testID: "event-detail-activity-plan-done-button",
      }),
    );
  },
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: any) => children,
  FormDateInputField: ({ control, name, testId }: any) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: any) =>
        React.createElement(
          "Text",
          { testID: testId },
          field.value === "2026-03-24" ? "Tuesday, Mar 24, 2026" : field.value,
        ),
    });
  },
  FormSwitchField: ({ control, name, testId }: any) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: any) =>
        React.createElement("Switch", {
          testID: testId,
          checked: field.value,
          onCheckedChange: field.onChange,
        }),
    });
  },
  FormTextareaField: ({ control, name, testId, placeholder }: any) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: any) =>
        React.createElement("Textarea", {
          testID: testId,
          placeholder,
          value: field.value,
          onChangeText: field.onChange,
        }),
    });
  },
  FormTextField: ({ control, name, testId, placeholder }: any) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: any) =>
        React.createElement("Input", {
          testID: testId,
          placeholder,
          value: field.value,
          onChangeText: field.onChange,
        }),
    });
  },
  FormTimeInputField: ({ control, name, testId }: any) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: any) => React.createElement("Text", { testID: testId }, field.value),
    });
  },
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: createHost("DateInput"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/time-input", () => ({
  __esModule: true,
  TimeInput: createHost("TimeInput"),
}));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
}));

jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: createHost("EntityCommentsSection"),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: jest.fn() },
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(async () => undefined),
  refreshScheduleWithCallbacks: jest.fn(async () => undefined),
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: () => ({ name: "Outdoor Run" }),
}));

jest.mock("@/lib/utils/plan/dateGrouping", () => ({
  __esModule: true,
  isActivityCompleted: () => false,
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: "ArrowUpRight",
  Calendar: "Calendar",
  CheckCircle2: "CheckCircle2",
  Ellipsis: "Ellipsis",
  Play: "Play",
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      events: { invalidate: jest.fn() },
    }),
    events: {
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false, refetch: jest.fn() }),
      },
      create: {
        useMutation: () => ({ isPending: false, mutate: createEventMutateMock }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => mockActivityPlansListUseQuery(),
      },
      getById: {
        useQuery: () => mockActivityPlanGetByIdUseQuery(),
      },
    },
    trainingPlans: {
      getById: {
        useQuery: () => ({ data: null }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
      loadFull: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
    },
    social: {
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
      addComment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
  },
}));

describe("event detail create mode", () => {
  function getDateInput(rendered: any, id: string) {
    return rendered.UNSAFE_getAllByType("DateInput").find((node: any) => node.props.id === id);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    paramsState = { mode: "create", date: "2026-03-24" };
    mockActivityPlansListUseQuery.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    mockActivityPlanGetByIdUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("prefills the selected date and requires the user to pick a type in the form", async () => {
    const rendered = renderNative(<EventDetailScreen />);

    expect((rendered as any).UNSAFE_getByType("StackScreen").props.options.title).toBe(
      "Create Event",
    );
    expect(getDateInput(rendered, "event-detail-start-date").props.value).toBe("2026-03-24");

    fireEvent.press(screen.getByTestId("event-detail-type-custom"));
    fireEvent(screen.getByTestId("event-detail-title-input"), "changeText", "Swim test");

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "custom",
          title: "Swim test",
          starts_at: expect.stringMatching(/^2026-03-24T/),
        }),
      );
    });
  });

  it("creates a planned event using a searched activity plan", async () => {
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "plan-1",
            name: "Tempo Run",
            activity_category: "run",
            estimated_duration: 3600,
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-type-planned"));
    expect(screen.queryByTestId("event-detail-recurrence-weekly")).toBeNull();
    expect(screen.queryByTestId("event-detail-activity-plan-search-input")).toBeNull();
    fireEvent.press(screen.getByTestId("event-detail-change-activity-plan-button"));
    fireEvent(screen.getByTestId("event-detail-activity-plan-search-input"), "changeText", "tempo");
    fireEvent.press(screen.getByTestId("event-detail-activity-plan-option-plan-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "planned",
          activity_plan_id: "plan-1",
          title: "Tempo Run",
          all_day: true,
          scheduled_date: "2026-03-24",
        }),
      );
    });
  });

  it("replaces plan-derived draft details when selecting a different activity plan", async () => {
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "plan-1",
            name: "Tempo Run",
            activity_category: "run",
            authoritative_metrics: { estimated_duration: 3600, estimated_tss: 78 },
          },
          {
            id: "plan-2",
            name: "Recovery Ride",
            activity_category: "bike",
            authoritative_metrics: { estimated_duration: 2400, estimated_tss: 35 },
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-type-planned"));
    fireEvent.press(screen.getByTestId("event-detail-change-activity-plan-button"));
    fireEvent.press(screen.getByTestId("event-detail-activity-plan-option-plan-1"));
    fireEvent.press(screen.getByTestId("event-detail-change-activity-plan-button"));
    fireEvent.press(screen.getByTestId("event-detail-activity-plan-option-plan-2"));

    expect(screen.getByTestId("event-detail-title-input").props.value).toBe("Recovery Ride");

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "planned",
          activity_plan_id: "plan-2",
          title: "Recovery Ride",
          scheduled_date: "2026-03-24",
        }),
      );
    });
  });

  it("preselects a passed activity plan without creating until save", async () => {
    paramsState = {
      mode: "create",
      date: "2026-03-24",
      trainingPlanId: "00000000-0000-4000-8000-000000000123",
      activityPlanId: "plan-tempo",
      scheduleGapTssDelta: "80",
    };
    mockActivityPlanGetByIdUseQuery.mockReturnValue({
      data: {
        id: "plan-tempo",
        name: "Tempo Run",
        activity_category: "run",
        authoritative_metrics: { estimated_duration: 3600, estimated_tss: 78 },
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderNative(<EventDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("event-detail-selected-activity-plan")).toBeTruthy();
    });
    expect(createEventMutateMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "planned",
          activity_plan_id: "plan-tempo",
          training_plan_id: "00000000-0000-4000-8000-000000000123",
          title: "Tempo Run",
          notes: expect.stringContaining("Schedule gap:"),
          all_day: true,
          scheduled_date: "2026-03-24",
        }),
      );
    });
  });

  it("does not auto-select a closest activity plan for an add-load plan suggestion", async () => {
    paramsState = {
      mode: "create",
      date: "2026-03-24",
      trainingPlanId: "00000000-0000-4000-8000-000000000123",
      planSuggestionType: "add_load",
      planSuggestionTssDelta: "75",
      planSuggestionDescription: "Add load to close the readiness gap.",
    };
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "plan-easy",
            name: "Easy Run",
            activity_category: "run",
            authoritative_metrics: { estimated_duration: 2400, estimated_tss: 35 },
          },
          {
            id: "plan-tempo",
            name: "Tempo Run",
            activity_category: "run",
            authoritative_metrics: { estimated_duration: 3600, estimated_tss: 72 },
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderNative(<EventDetailScreen />);

    expect(screen.queryByTestId("event-detail-selected-activity-plan")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    expect(createEventMutateMock).not.toHaveBeenCalled();
  });

  it("prefills a reduce-load plan suggestion as a custom adjustment note", async () => {
    paramsState = {
      mode: "create",
      date: "2026-03-24",
      planSuggestionType: "reduce_load",
      planSuggestionTssDelta: "-40",
      planSuggestionDescription: "Reduce load to protect readiness.",
    };

    renderNative(<EventDetailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "custom",
          title: "Reduce scheduled load",
          notes: expect.stringContaining("Reduce load to protect readiness."),
          starts_at: expect.stringMatching(/^2026-03-24T/),
        }),
      );
    });
  });
});
