import { act } from "@testing-library/react-native";
import React from "react";
import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import GroupEventEditRoute from "../group-event-edit";

const replaceMock = jest.fn();
const updateEventMock = jest.fn();
const updateEventOccurrenceMock = jest.fn();

let detailEvent: any;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  KeyboardAvoidingView: mockCreateHost("KeyboardAvoidingView"),
  Platform: { OS: "ios" },
  ScrollView: mockCreateHost("ScrollView"),
  View: mockCreateHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: mockCreateHost("StackScreen") },
  useLocalSearchParams: () => ({ groupEventId: "occurrence-1" }),
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/components/groups", () => ({
  __esModule: true,
  GroupEventForm: React.forwardRef(function MockGroupEventForm(props: any, ref: any) {
    React.useImperativeHandle(ref, () => ({
      submit: () =>
        props.onSubmit({ title: "Occurrence override", startsAt: "2026-05-28T12:00:00.000Z" }),
    }));

    return React.createElement(
      "Button",
      {
        onPress: () =>
          props.onSubmit({ title: "Occurrence override", startsAt: "2026-05-28T12:00:00.000Z" }),
        testID: "mock-group-event-form-submit",
      },
      "Submit form",
    );
  }),
  GroupListSkeleton: mockCreateHost("GroupListSkeleton"),
}));

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupEventActions: () => ({
    updateEvent: updateEventMock,
    updateEventOccurrence: updateEventOccurrenceMock,
    updateMutation: { isPending: false },
    updateEventOccurrenceMutation: { isPending: false },
  }),
  useGroupEventDetailViewModel: () => ({
    event: detailEvent,
    isError: false,
    isLoading: false,
  }),
}));

describe("GroupEventEditRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    detailEvent = {
      id: "occurrence-1",
      group_id: "group-1",
      series_id: "series-1",
      is_recurring_occurrence: true,
      activityPlanOptions: [],
    };
    updateEventOccurrenceMock.mockResolvedValue({ event: { id: "occurrence-1" } });
    updateEventMock.mockResolvedValue({ event: { id: "event-1" } });
  });

  it("sends recurring occurrence edits through the occurrence override mutation", async () => {
    renderNative(<GroupEventEditRoute />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("mock-group-event-form-submit"));
    });

    await waitFor(() => {
      expect(updateEventOccurrenceMock).toHaveBeenCalledWith({
        groupEventId: "occurrence-1",
        title: "Occurrence override",
        startsAt: "2026-05-28T12:00:00.000Z",
      });
    });
    expect(updateEventMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith({
      pathname: "/group-event-detail",
      params: { groupEventId: "occurrence-1" },
    });
  });
});
