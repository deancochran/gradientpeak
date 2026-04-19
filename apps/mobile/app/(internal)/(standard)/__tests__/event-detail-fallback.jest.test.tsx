import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const eventDetailData = {
  id: "event-1",
  event_type: "planned",
  title: "Tempo Builder",
  scheduled_date: "2026-03-23",
  starts_at: "2026-03-23T09:00:00.000Z",
  all_day: false,
  notes: "Bring gels",
  activity_plan: {
    id: "plan-1",
    name: "Tempo Builder",
    description: "Progressive tempo with a strong finish.",
    activity_category: "outdoor_run",
    estimated_duration: 3600,
    estimated_tss: 72,
  },
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
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/components/ScheduleActivityModal", () => ({
  __esModule: true,
  ScheduleActivityModal: createHost("ScheduleActivityModal"),
}));

jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
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

jest.mock("@repo/core", () => ({
  __esModule: true,
  formatDurationSec: jest.fn(() => "60 min"),
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
  getActivityBgClass: () => "bg-primary",
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
  Clock: "Clock",
  Edit: "Edit",
  Play: "Play",
  Trash2: "Trash2",
  Zap: "Zap",
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
          mutate: jest.fn(),
        }),
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: jest.fn(),
        }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
    },
  },
}));

describe("event detail fallback screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders planned activity content directly instead of the fallback note", () => {
    const rendered = renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Advanced event detail")).toBeNull();
    expect(
      (rendered as any).UNSAFE_getByType("ActivityPlanContentPreview").props.testIDPrefix,
    ).toBe("event-detail-plan");
    expect(screen.getByText("Activity details")).toBeTruthy();
    expect(screen.getByText("Edit Activity")).toBeTruthy();
  });

  it("preserves planned-event schedule handoff through ScheduleActivityModal", () => {
    renderNative(<EventDetailScreen />);

    fireEvent.press(screen.getByTestId("event-detail-reschedule-button"));

    const modal = (screen as any).UNSAFE_getByType("ScheduleActivityModal");
    expect(modal.props.eventId).toBe("event-1");
    expect(modal.props.editScope).toBe("single");
    expect(modal.props.visible).toBe(true);
  });
});
