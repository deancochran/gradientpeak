import { act } from "@testing-library/react-native";
import React from "react";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import {
  createFormComponentMocks as mockCreateFormComponentMocks,
  createHost as mockCreateHost,
} from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import EventDetailUpdateScreen from "../event-detail-update";

const updateEventMutateMock = jest.fn();
const createEventMutateMock = jest.fn();
const dismissToMock = jest.fn();
const replaceMock = jest.fn();
const refreshScheduleViewsMock = jest.fn<Promise<void>, [unknown, unknown]>(async () => undefined);
let updateMutationOptions:
  | { onSuccess?: (event: { id: string }) => Promise<void> | void }
  | undefined;
const mockActivityPlansListUseQuery: jest.Mock = jest.fn(() => ({
  data: { items: [] },
  isLoading: false,
  error: null,
  refetch: jest.fn(),
}));

type ActivityPlanFixture = ReturnType<typeof createActivityPlanSummary>;
type EventEditorInput = { starts_at: string; recurrence_rule?: string | null };
type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};
type ResourcePickerProps = {
  onSelect: (item: Record<string, unknown>) => void;
  scope: "activityPlans" | "routes";
  visible: boolean;
};

const eventDetailData: {
  id: string;
  event_type: string;
  title: string;
  starts_at: string;
  timezone: string;
  ends_at: string | null;
  all_day: boolean;
  notes: string;
  activity_plan_id: string | null;
  activityPlanSummary: ActivityPlanFixture | null;
  route_id?: string | null;
  route?: { id: string; name: string } | null;
  recurrence_rule: string | null;
  series_id: string | null;
  occurrence_key: string | null;
  original_starts_at: string | null;
} = {
  id: "event-1",
  event_type: "custom" as string,
  title: "Tempo Builder",
  starts_at: "2026-03-23T09:00:00.000Z",
  timezone: "UTC",
  ends_at: null as string | null,
  all_day: false,
  notes: "Bring gels",
  activity_plan_id: null as string | null,
  activityPlanSummary: null,
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
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ id: "event-1" }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useRouter: () => ({
    back: jest.fn(),
    dismissTo: dismissToMock,
    navigate: jest.fn(),
    push: jest.fn(),
    replace: replaceMock,
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
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: mockCreateHost("RouteCard"),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: mockCreateHost("AppFormModal"),
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
  parseEventDateForEditor: (event: EventEditorInput) => new Date(event.starts_at),
  parseRecurrenceEndDate: (event: EventEditorInput) => {
    const match = event.recurrence_rule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  },
  parseRecurrenceFrequency: (event: EventEditorInput) =>
    event.recurrence_rule?.includes("FREQ=WEEKLY") ? "weekly" : "none",
}));

jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: ({ onSelect, scope, visible }: ResourcePickerProps) => {
    if (!visible) return null;
    const React = require("react");
    const items =
      scope === "routes"
        ? [{ id: "route-1", name: "River Loop" }]
        : (mockActivityPlansListUseQuery().data?.items ?? []);
    return React.createElement(
      "ResourcePickerModal",
      { visible },
      ...items.map((item: { id: string; name: string }) =>
        React.createElement(
          "Button",
          {
            key: item.id,
            onPress: () =>
              onSelect(
                scope === "routes"
                  ? { kind: "route", id: item.id, label: item.name, route: item }
                  : {
                      kind: "activityPlan",
                      id: item.id,
                      label: item.name,
                      activityPlan: item,
                    },
              ),
            testID: `event-detail-update-${scope === "routes" ? "route" : "activity-plan"}-option-${item.id}`,
          },
          React.createElement("Text", null, item.name),
        ),
      ),
    );
  },
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: (queryClient: unknown, scope: unknown) =>
    refreshScheduleViewsMock(queryClient, scope),
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
        useMutation: (options?: typeof updateMutationOptions) => {
          updateMutationOptions = options;
          return {
            isPending: false,
            mutate: updateEventMutateMock,
          };
        },
      },
      create: {
        useMutation: () => ({
          isPending: false,
          mutate: createEventMutateMock,
        }),
      },
    },
    plannedSessions: {
      create: { useMutation: () => ({ isPending: false, mutate: createEventMutateMock }) },
      recordingLaunch: { useMutation: () => ({ mutateAsync: jest.fn() }) },
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
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    jest.clearAllMocks();
    eventDetailData.recurrence_rule = null;
    eventDetailData.ends_at = null;
    eventDetailData.event_type = "custom";
    eventDetailData.activity_plan_id = null;
    eventDetailData.activityPlanSummary = null;
    eventDetailData.route_id = null;
    eventDetailData.route = null;
    eventDetailData.series_id = null;
    eventDetailData.occurrence_key = null;
    eventDetailData.original_starts_at = null;
    updateMutationOptions = undefined;
    refreshScheduleViewsMock.mockResolvedValue(undefined);
    mockActivityPlansListUseQuery.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("keeps save and cancel actions inside the update form", async () => {
    await renderNative(<EventDetailUpdateScreen />);

    expect(screen.getByTestId("event-detail-update-scroll")).toBeTruthy();
    expect(screen.getByTestId("event-detail-update-cancel-button")).toBeTruthy();
    expect(screen.getByTestId("event-detail-update-save-button")).toBeTruthy();
  });

  it("saves edits from the dedicated update route", async () => {
    await renderNative(<EventDetailUpdateScreen />);

    expect(screen.getByTestId("event-detail-update-title-input").props.selectTextOnFocus).toBe(
      true,
    );

    await fireEvent(
      screen.getByTestId("event-detail-update-title-input"),
      "changeText",
      "Updated Event",
    );
    await fireEvent(
      screen.getByTestId("event-detail-update-notes-input"),
      "changeText",
      "Updated notes",
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
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

  it("asks for an update scope before saving a recurring event", async () => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY";

    await renderNative(<EventDetailUpdateScreen />);

    await fireEvent(
      screen.getByTestId("event-detail-update-title-input"),
      "changeText",
      "Updated Event",
    );
    expect(screen.queryByTestId("event-detail-update-repeat-row")).toBeNull();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    expect(updateEventMutateMock).not.toHaveBeenCalled();
    expect(screen.getByText("This event only")).toBeTruthy();
    expect(screen.getByText("This and future events")).toBeTruthy();
    expect(screen.getByText("Entire series")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-scope-future"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "future",
          patch: {
            notes: "Bring gels",
            title: "Updated Event",
          },
        }),
      );
    });
  });

  it("navigates to the updated event before schedule refresh settles", async () => {
    let finishRefresh: () => void = () => undefined;
    refreshScheduleViewsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    await renderNative(<EventDetailUpdateScreen />);

    const completion = updateMutationOptions?.onSuccess?.({ id: "event-1" });
    await Promise.resolve();

    expect(replaceMock).toHaveBeenCalledWith("/event-detail?id=event-1");
    expect(dismissToMock).not.toHaveBeenCalled();

    finishRefresh();
    await completion;
  });

  it.each([
    "future",
    "series",
  ])("does not drop a changed start time when saving scope %s", async (scope) => {
    eventDetailData.recurrence_rule = "FREQ=WEEKLY";
    await renderNative(<EventDetailUpdateScreen />);
    await fireEvent(screen.getByTestId("event-detail-update-start-time-button"), "change", "10:30");
    await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    await fireEvent.press(screen.getByTestId(`event-detail-update-scope-${scope}`));
    expect(updateEventMutateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Save schedule or route changes to this event only/)).toBeTruthy();

    // The same draft remains editable and can be saved to the supported scope.
    await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    await fireEvent.press(screen.getByTestId("event-detail-update-scope-single"));
    expect(updateEventMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "single",
        patch: expect.objectContaining({ starts_at: expect.stringContaining("10:30") }),
      }),
    );
  });

  it("edits a materialized occurrence override with single-occurrence scope", async () => {
    eventDetailData.series_id = "series-1";
    eventDetailData.occurrence_key = "2026-03-23";
    eventDetailData.original_starts_at = "2026-03-23T09:00:00.000Z";

    await renderNative(<EventDetailUpdateScreen />);

    await fireEvent(
      screen.getByTestId("event-detail-update-title-input"),
      "changeText",
      "Override Title",
    );
    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });
    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-scope-single"));
    });

    await waitFor(() => {
      expect(updateEventMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-1",
          scope: "single",
          patch: expect.objectContaining({
            title: "Override Title",
          }),
        }),
      );
    });
  });

  it("does not attach executable activity plans through a generic event update", async () => {
    mockActivityPlansListUseQuery.mockReturnValue({
      data: {
        items: [
          createActivityPlanSummary({
            id: "11111111-1111-4111-8111-111111111111",
            name: "Tempo Run",
            activityCategory: "run",
          }),
        ],
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    await renderNative(<EventDetailUpdateScreen />);

    await fireEvent.press(screen.getByTestId("event-detail-update-type-planned"));
    await fireEvent.press(screen.getByTestId("event-detail-update-change-activity-plan-button"));
    await fireEvent.press(
      screen.getByTestId(
        "event-detail-update-activity-plan-option-11111111-1111-4111-8111-111111111111",
      ),
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    expect(updateEventMutateMock).not.toHaveBeenCalled();
  });

  it("does not detach executable activity plans through a generic event update", async () => {
    eventDetailData.event_type = "planned";
    eventDetailData.activity_plan_id = "11111111-1111-4111-8111-111111111111";
    eventDetailData.route_id = "route-1";
    eventDetailData.route = { id: "route-1", name: "River Loop" };
    eventDetailData.activityPlanSummary = createActivityPlanSummary({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Tempo Run",
      activityCategory: "run",
    });
    await renderNative(<EventDetailUpdateScreen />);
    await fireEvent.press(screen.getByTestId("event-detail-update-remove-activity-plan-button"));

    await act(async () => {
      await fireEvent.press(screen.getByTestId("event-detail-update-save-button"));
    });

    expect(updateEventMutateMock).not.toHaveBeenCalled();
  });
});
