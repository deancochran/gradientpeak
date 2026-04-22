import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
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
  all_day: false,
  notes: "Bring gels",
  activity_plan: null,
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
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/switch", () => ({ __esModule: true, Switch: createHost("Switch") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("saves edits from the dedicated update route", () => {
    renderNative(<EventDetailUpdateScreen />);

    fireEvent(screen.getByTestId("event-detail-update-title-input"), "changeText", "Updated Event");
    fireEvent(screen.getByTestId("event-detail-update-notes-input"), "changeText", "Updated notes");
    fireEvent.press(screen.getByTestId("event-detail-update-save-button"));

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
