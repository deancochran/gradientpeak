import { act } from "@testing-library/react-native";
import React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import EventDetailUpdateScreen from "../event-detail-update";

const updateEventMutateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const eventDetailData = {
  id: "event-1",
  event_type: "custom",
  title: "Tempo Builder",
  starts_at: "2026-03-23T09:00:00.000Z",
  ends_at: null as string | null,
  all_day: false,
  notes: "Bring gels",
  activity_plan: null,
  recurrence_rule: null as string | null,
};

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
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) => React.createElement("StackScreen", props),
  },
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: createHost("DateInput"),
}));
jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: any) => children,
  FormDateInputField: ({ control, name, testId }: any) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field }: any) => React.createElement("Text", { testID: testId }, field.value),
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

  it("saves recurrence presets through the event editor", async () => {
    const rendered = renderNative(<EventDetailUpdateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-detail-update-recurrence-weekly"));
    });
    await act(async () => {
      getDateInput(rendered, "event-detail-update-recurrence-end-date").props.onChange(
        "2026-04-30",
      );
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
});
