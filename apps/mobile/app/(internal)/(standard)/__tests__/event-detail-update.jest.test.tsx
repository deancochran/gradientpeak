import { act } from "@testing-library/react-native";
import React from "react";
import {
  createFormComponentMocks as mockCreateFormComponentMocks,
  createHost as mockCreateHost,
} from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import EventDetailUpdateScreen from "../event-detail-update";

const updateEventMutateMock = jest.fn();
const createEventMutateMock = jest.fn();
const mockActivityPlansListUseQuery: jest.Mock = jest.fn(() => ({
  data: { items: [] },
  isLoading: false,
  error: null,
  refetch: jest.fn(),
}));

const eventDetailData = {
  id: "event-1",
  event_type: "custom" as string,
  title: "Tempo Builder",
  starts_at: "2026-03-23T09:00:00.000Z",
  ends_at: null as string | null,
  all_day: false,
  notes: "Bring gels",
  activity_plan_id: null as string | null,
  activity_plan: null,
  recurrence_rule: null as string | null,
  series_id: null as string | null,
  occurrence_key: null as string | null,
  original_starts_at: null as string | null,
};

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: mockCreateHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  Pressable: mockCreateHost("Pressable"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
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
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: mockCreateHost("DateInput"),
}));
jest.mock("@repo/ui/components/form", () => mockCreateFormComponentMocks());
jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: mockCreateHost("Input"),
}));
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: mockCreateHost("Switch"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@repo/ui/components/time-input", () => ({
  __esModule: true,
  TimeInput: mockCreateHost("TimeInput"),
}));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: mockCreateHost("Textarea"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: mockCreateHost("ActivityPlanCard"),
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: mockCreateHost("DateTimePicker"),
}));

jest.mock("@/components/event/EventEditorCard", () => ({
  __esModule: true,
  buildAllDayStartIso: (value: Date) => `${value.toISOString().slice(0, 10)}T00:00:00.000Z`,
  buildCreateStartsAt: (date?: string) => new Date(`${date ?? "2026-03-24"}T09:00:00.000Z`),
  buildRecurrenceFromFrequency: (frequency: string, endDate: string | null) =>
    frequency === "none" || !endDate
      ? null
      : {
          rule: `FREQ=${frequency.toUpperCase()};UNTIL=${endDate.replace(/-/g, "")}T235959Z`,
          timezone: "UTC",
        },
  parseEventDateForEditor: (event: any) => new Date(event.starts_at),
  parseRecurrenceEndDate: (event: any) => {
    const match = event.recurrence_rule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  },
  parseRecurrenceFrequency: (event: any) =>
    event.recurrence_rule?.includes("FREQ=WEEKLY") ? "weekly" : "none",
}));

jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: ({ onSelect, visible }: any) => {
    if (!visible) return null;
    const React = require("react");
    const items = mockActivityPlansListUseQuery().data?.items ?? [];
    return React.createElement(
      "ResourcePickerModal",
      { visible },
      ...items.map((item: any) =>
        React.createElement(
          "Button",
          {
            key: item.id,
            onPress: () => onSelect(item),
            testID: `event-detail-update-activity-plan-option-${item.id}`,
          },
          item.name,
        ),
      ),
    );
  },
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleWithCallbacks: jest.fn(async () => undefined),
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: () => ({ name: "Outdoor Run" }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      getById: {
        useQuery: () => ({
          data: eventDetailData,
          error: null,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutate: updateEventMutateMock,
        }),
      },
      create: {
        useMutation: () => ({
          isPending: false,
          mutate: createEventMutateMock,
        }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => mockActivityPlansListUseQuery(),
      },
      getById: {
        useQuery: () => ({ data: null, isLoading: false, error: null, refetch: jest.fn() }),
      },
    },
  },
}));

describe("event detail update screen", () => {
  function getDateInput(rendered: any, id: string) {
    return rendered.UNSAFE_getAllByType("DateInput").find((node: any) => node.props.id === id);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    eventDetailData.recurrence_rule = null;
    eventDetailData.ends_at = null;
    eventDetailData.event_type = "custom";
    eventDetailData.activity_plan_id = null;
    eventDetailData.activity_plan = null;
    eventDetailData.series_id = null;
    eventDetailData.occurrence_key = null;
    eventDetailData.original_starts_at = null;
    mockActivityPlansListUseQuery.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("saves edits from the dedicated update route", async () => {
    renderNative(<EventDetailUpdateScreen />);

    fireEvent(screen.getByTestId("event-detail-update-title-input"), "changeText", "Updated Event");
    fireEvent(screen.getByTestId("event-detail-update-notes-input"), "changeText", "Updated notes");

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "single",
          patch: expect.objectContaining({
            title: "Updated Event",
            notes: "Updated notes",
          }),
        }),
      );
    });
  });

  it("asks for recurring save scope before mutating", async () => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    const rendered = renderNative(<EventDetailUpdateScreen />);

    fireEvent(screen.getByTestId("event-detail-update-title-input"), "changeText", "Updated Event");
    await act(async () => {
      getDateInput(rendered, "event-detail-update-start-date").props.onChange("2026-04-30");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-detail-update-scope-modal")).toBeTruthy();
    });
    expect(updateEventMutateMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-scope-future"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "future",
          patch: expect.objectContaining({
            title: "Updated Event",
          }),
        }),
      );
    });
  });

  it("passes the selected entire-series scope for recurring edits", async () => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY;UNTIL=20260530T235959Z";

    renderNative(<EventDetailUpdateScreen />);

    fireEvent(screen.getByTestId("event-detail-update-title-input"), "changeText", "Series Title");
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    expect(updateEventMutateMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-scope-series"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "series",
          patch: expect.objectContaining({
            title: "Series Title",
          }),
        }),
      );
    });
  });

  it("requires an end date before saving a recurring series", async () => {
    renderNative(<EventDetailUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-repeat-row"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-recurrence-weekly"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-repeat-done-button"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    expect(screen.getByText("Choose when this repeating series should end.")).toBeTruthy();
    expect(updateEventMutateMock).not.toHaveBeenCalled();
  });

  it("saves recurrence presets through the event editor", async () => {
    const rendered = renderNative(<EventDetailUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-repeat-row"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-recurrence-weekly"));
    });
    await act(async () => {
      getDateInput(rendered, "event-detail-update-recurrence-end-date").props.onChange(
        "2026-04-30",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-repeat-done-button"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "single",
          patch: expect.objectContaining({
            recurrence: {
              rule: "FREQ=WEEKLY;UNTIL=20260430T235959Z",
              timezone: "UTC",
            },
          }),
        }),
      );
    });
  });

  it("asks for save scope when editing a materialized occurrence override without its own recurrence rule", async () => {
    eventDetailData.series_id = "series-1";
    eventDetailData.occurrence_key = "2026-03-23";
    eventDetailData.original_starts_at = "2026-03-23T09:00:00.000Z";

    renderNative(<EventDetailUpdateScreen />);

    fireEvent(
      screen.getByTestId("event-detail-update-title-input"),
      "changeText",
      "Override Title",
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-detail-update-scope-modal")).toBeTruthy();
    });
    expect(updateEventMutateMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-scope-series"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "series",
          patch: expect.objectContaining({
            title: "Override Title",
          }),
        }),
      );
    });
  });

  it("attaches and detaches activity plans through the same update editor", async () => {
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [{ id: "11111111-1111-4111-8111-111111111111", name: "Tempo Run" }],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderNative(<EventDetailUpdateScreen />);

    fireEvent.press(screen.getByTestId("event-detail-update-type-planned"));
    fireEvent.press(screen.getByTestId("event-detail-update-change-activity-plan-button"));
    fireEvent.press(
      screen.getByTestId(
        "event-detail-update-activity-plan-option-11111111-1111-4111-8111-111111111111",
      ),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            activity_plan_id: "11111111-1111-4111-8111-111111111111",
            event_type: "planned",
          }),
        }),
      );
    });

    eventDetailData.event_type = "planned";
    eventDetailData.activity_plan_id = "11111111-1111-4111-8111-111111111111";
    eventDetailData.activity_plan = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Tempo Run",
    } as any;
    updateEventMutateMock.mockClear();

    renderNative(<EventDetailUpdateScreen />);
    fireEvent.press(screen.getByTestId("event-detail-update-remove-activity-plan-button"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            activity_plan_id: null,
            event_type: "custom",
          }),
        }),
      );
    });
  });
});
