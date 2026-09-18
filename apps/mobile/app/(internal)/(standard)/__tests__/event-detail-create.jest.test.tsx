import { act } from "@testing-library/react-native";
import React from "react";
import type { Control, ControllerRenderProps, FieldValues } from "react-hook-form";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import {
  createActivityPlanDetail,
  createActivityPlanSummary,
} from "../../../../test/activity-plan-projection-fixture";
import { createFormComponentMocks, createHost } from "../../../../test/mock-components";
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

type ActivityPlanFixture = ReturnType<typeof createActivityPlanSummary>;
type RecurrenceFixture = { recurrence?: { endDate?: string | null; frequency?: string } } | null;
type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};
type ResourcePickerProps = {
  onClose: () => void;
  onSelect: (item: {
    kind: "activityPlan";
    id: string;
    label: string;
    activityPlan: ActivityPlanFixture;
  }) => void;
  visible: boolean;
};
type FormFieldMockProps = {
  accessibilityHint?: string;
  clearable?: boolean;
  control: Control<FieldValues>;
  name: string;
  placeholder?: string;
  testId?: string;
};
type MockControllerField = ControllerRenderProps<FieldValues, string>;
function getHostByType(rendered: Awaited<ReturnType<typeof renderNative>>, type: string) {
  return rendered.container.queryAll((node) => node.type === type)[0] as ReactTestInstance;
}

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
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => paramsState,
  useNavigation: () => ({ dispatch: jest.fn() }),
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

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector: (state: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: "11111111-1111-4111-8111-111111111111" } }),
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
  parseRecurrenceEndDate: (event: RecurrenceFixture) => event?.recurrence?.endDate ?? null,
  parseRecurrenceFrequency: (event: RecurrenceFixture) => event?.recurrence?.frequency ?? "none",
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
  ResourcePickerModal: ({ onClose, onSelect, visible }: ResourcePickerProps) => {
    if (!visible) return null;
    const React = require("react");
    const data = mockActivityPlansListUseQuery().data;
    const items = data?.items ?? [];
    return React.createElement(
      "ResourcePickerModal",
      { visible },
      React.createElement("Input", { testID: "event-detail-activity-plan-search-input" }),
      ...items.map((item: ActivityPlanFixture) =>
        React.createElement(
          "Button",
          {
            key: item.id,
            onPress: () =>
              onSelect({ kind: "activityPlan", id: item.id, label: item.name, activityPlan: item }),
            testID: `event-detail-activity-plan-option-${item.id}`,
          },
          React.createElement("Text", null, item.name),
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
  FormTimezoneField: createFormComponentMocks().FormTimezoneField,
  Form: ({ children }: React.PropsWithChildren) => children,
  FormDateInputField: ({
    accessibilityHint,
    clearable,
    control,
    name,
    testId,
  }: FormFieldMockProps) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: { field: MockControllerField }) =>
        React.createElement(
          "Text",
          {
            accessibilityHint,
            clearable,
            onChange: field.onChange,
            testID: testId,
            value: field.value,
          },
          field.value === "2026-03-24" ? "Tuesday, Mar 24, 2026" : field.value,
        ),
    });
  },
  FormSwitchField: ({ control, name, testId }: FormFieldMockProps) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: { field: MockControllerField }) =>
        React.createElement("Switch", {
          testID: testId,
          checked: field.value,
          onCheckedChange: field.onChange,
        }),
    });
  },
  FormTextareaField: ({ control, name, testId, placeholder }: FormFieldMockProps) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: { field: MockControllerField }) =>
        React.createElement("Textarea", {
          testID: testId,
          placeholder,
          value: field.value,
          onChangeText: field.onChange,
        }),
    });
  },
  FormTextField: ({ control, name, testId, placeholder }: FormFieldMockProps) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: { field: MockControllerField }) =>
        React.createElement("Input", {
          testID: testId,
          placeholder,
          value: field.value,
          onChangeText: field.onChange,
        }),
    });
  },
  FormTimeInputField: ({ control, name, testId }: FormFieldMockProps) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: { field: MockControllerField }) =>
        React.createElement("Text", { testID: testId, onChange: field.onChange }, field.value),
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
    activities: {
      createManualDiaryEntry: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
    },
    plannedSessions: {
      create: { useMutation: () => ({ isPending: false, mutate: createEventMutateMock }) },
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
      skip: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      linkCompletion: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      completionCandidates: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [], nextCursor: null }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
        }),
      },
    },
    profiles: {
      get: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
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
      get: {
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
      toggleLike: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
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

async function chooseCustomSchedule() {
  await fireEvent(screen.getByTestId("event-detail-timezone"), "change", "UTC");
  await fireEvent(screen.getByTestId("event-detail-start-time-button"), "change", "09:00");
}

describe("event detail create mode", () => {
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
    const rendered = await renderNative(<EventDetailScreen />);

    expect(screen.getByTestId("event-detail-screen")).toBeTruthy();
    expect(getHostByType(rendered, "StackScreen").props.options.title).toBe("Create Event");
    expect(screen.getByTestId("event-detail-start-date-button").props.children).toBe(
      "Tuesday, Mar 24, 2026",
    );

    await fireEvent.press(screen.getByTestId("event-detail-type-custom"));
    await fireEvent(screen.getByTestId("event-detail-title-input"), "changeText", "Swim test");
    await fireEvent.press(screen.getByTestId("event-detail-save-button"));
    expect(createEventMutateMock).not.toHaveBeenCalled();
    await chooseCustomSchedule();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
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
          createActivityPlanSummary({
            id: "22222222-2222-4222-8222-222222222222",
            name: "Tempo Run",
            activityCategory: "run",
          }),
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-type-planned"));
    expect(screen.queryByTestId("event-detail-recurrence-weekly")).toBeNull();
    expect(screen.queryByTestId("event-detail-activity-plan-search-input")).toBeNull();
    await fireEvent.press(screen.getByTestId("event-detail-change-activity-plan-button"));
    await fireEvent(
      screen.getByTestId("event-detail-activity-plan-search-input"),
      "changeText",
      "tempo",
    );
    await fireEvent.press(
      screen.getByTestId("event-detail-activity-plan-option-22222222-2222-4222-8222-222222222222"),
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "11111111-1111-4111-8111-111111111111",
          session: expect.objectContaining({
            activityPlanId: "22222222-2222-4222-8222-222222222222",
            planningDate: "2026-03-24",
            source: expect.objectContaining({ kind: "direct" }),
          }),
        }),
      );
    });
  });

  it("uses the shared date field to set and clear a recurrence end date", async () => {
    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-type-custom"));
    await fireEvent(screen.getByTestId("event-detail-title-input"), "changeText", "Swim test");
    await chooseCustomSchedule();
    await fireEvent.press(screen.getByTestId("event-detail-repeat-row"));
    await fireEvent.press(screen.getByTestId("event-detail-recurrence-weekly"));

    const recurrenceEndDate = screen.getByTestId("event-detail-recurrence-end-date-button");
    expect(recurrenceEndDate.props.accessibilityHint).toBe("Choose when this series should end");
    expect(recurrenceEndDate.props.clearable).toBe(true);

    await act(async () => {
      recurrenceEndDate.props.onChange("2026-04-01");
    });
    await fireEvent.press(screen.getByTestId("event-detail-repeat-done-button"));
    await fireEvent.press(screen.getByTestId("event-detail-save-button"));

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recurrence: { frequency: "weekly", endDate: "2026-04-01" },
        }),
      );
    });

    await fireEvent.press(screen.getByTestId("event-detail-repeat-row"));
    await act(async () => {
      screen.getByTestId("event-detail-recurrence-end-date-button").props.onChange(null);
    });
    await fireEvent.press(screen.getByTestId("event-detail-repeat-done-button"));
    await fireEvent.press(screen.getByTestId("event-detail-save-button"));

    await waitFor(() => {
      expect(screen.getByText("Choose when this repeating series should end.")).toBeTruthy();
    });
  });

  it("replaces plan-derived draft details when selecting a different activity plan", async () => {
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [
          createActivityPlanSummary({
            id: "22222222-2222-4222-8222-222222222222",
            name: "Tempo Run",
            activityCategory: "run",
          }),
          createActivityPlanSummary({
            id: "33333333-3333-4333-8333-333333333333",
            name: "Recovery Ride",
            activityCategory: "bike",
          }),
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-type-planned"));
    await fireEvent.press(screen.getByTestId("event-detail-change-activity-plan-button"));
    await fireEvent.press(
      screen.getByTestId("event-detail-activity-plan-option-22222222-2222-4222-8222-222222222222"),
    );
    await fireEvent.press(screen.getByTestId("event-detail-change-activity-plan-button"));
    await fireEvent.press(
      screen.getByTestId("event-detail-activity-plan-option-33333333-3333-4333-8333-333333333333"),
    );

    expect(screen.getByTestId("event-detail-title-input").props.value).toBe("Recovery Ride");

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "11111111-1111-4111-8111-111111111111",
          session: expect.objectContaining({
            activityPlanId: "33333333-3333-4333-8333-333333333333",
            planningDate: "2026-03-24",
            source: expect.objectContaining({ kind: "direct" }),
          }),
        }),
      );
    });
  });

  it("preselects a passed activity plan without creating until save", async () => {
    paramsState = {
      mode: "create",
      date: "2026-03-24",
      trainingPlanId: "00000000-0000-4000-8000-000000000123",
      activityPlanId: "44444444-4444-4444-8444-444444444444",
      scheduleGapLoadDelta: "80",
    };
    mockActivityPlanGetByIdUseQuery.mockReturnValue({
      data: {
        detail: createActivityPlanDetail({
          id: "44444444-4444-4444-8444-444444444444",
          name: "Tempo Run",
          activityCategory: "run",
        }),
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    await renderNative(<EventDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("event-detail-selected-activity-plan")).toBeTruthy();
    });
    expect(createEventMutateMock).not.toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "11111111-1111-4111-8111-111111111111",
          session: expect.objectContaining({
            activityPlanId: "44444444-4444-4444-8444-444444444444",
            planningDate: "2026-03-24",
            source: expect.objectContaining({ kind: "direct" }),
          }),
        }),
      );
    });
  });

  it("preselects a route passed from route detail and includes it when creating", async () => {
    paramsState = {
      mode: "create",
      date: "2026-03-24",
      routeId: "route-1",
      routeName: "River Loop",
    };

    await renderNative(<EventDetailScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-type-custom"));
    await fireEvent(screen.getByTestId("event-detail-title-input"), "changeText", "Route session");
    await chooseCustomSchedule();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    await waitFor(() => {
      expect(createEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "custom",
          route_id: "route-1",
          title: "Route session",
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
      planSuggestionLoadDelta: "75",
      planSuggestionDescription: "Add load to close the readiness gap.",
    };
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [
          createActivityPlanSummary({
            id: "plan-easy",
            name: "Easy Run",
            activityCategory: "run",
          }),
          createActivityPlanSummary({
            id: "plan-tempo",
            name: "Tempo Run",
            activityCategory: "run",
          }),
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    await renderNative(<EventDetailScreen />);

    expect(screen.queryByTestId("event-detail-selected-activity-plan")).toBeNull();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
    });

    expect(createEventMutateMock).not.toHaveBeenCalled();
  });

  it("prefills a reduce-load plan suggestion as a custom adjustment note", async () => {
    paramsState = {
      mode: "create",
      date: "2026-03-24",
      planSuggestionType: "reduce_load",
      planSuggestionLoadDelta: "-40",
      planSuggestionDescription: "Reduce load to protect readiness.",
    };

    await renderNative(<EventDetailScreen />);
    await chooseCustomSchedule();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-save-button"));
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
