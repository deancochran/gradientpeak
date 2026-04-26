import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

const mockNavigateTo = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
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
  useLocalSearchParams: () => ({ id: "event-1" }),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => mockNavigateTo,
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/event/EventEditorCard", () => ({
  __esModule: true,
  EventEditorCard: createHost("EventEditorCard"),
  buildAllDayStartIso: jest.fn(),
  buildCreateStartsAt: jest.fn(() => new Date("2026-03-24T00:00:00.000Z")),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: createHost("EntityCommentsSection"),
}));

jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(async () => undefined),
}));

jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: () => ({ name: "Outdoor Run" }),
}));

jest.mock("@/lib/utils/plan/dateGrouping", () => ({
  __esModule: true,
  isActivityCompleted: () => false,
}));

jest.mock("@/lib/hooks/useDeletedDetailRedirect", () => ({
  __esModule: true,
  useDeletedDetailRedirect: () => ({
    beginRedirect: jest.fn(),
    isRedirecting: false,
    redirectOnNotFound: jest.fn(),
  }),
}));

jest.mock("@/lib/hooks/useEntityCommentsController", () => ({
  __esModule: true,
  useEntityCommentsController: () => ({
    addCommentPending: false,
    commentCount: 0,
    comments: [],
    handleAddComment: jest.fn(),
    hasMoreComments: false,
    isLoadingMoreComments: false,
    loadMoreComments: jest.fn(),
    newComment: "",
    setNewComment: jest.fn(),
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      getById: {
        useQuery: () => ({
          data: {
            id: "event-1",
            event_type: "planned",
            title: "Tempo Builder",
            starts_at: "2026-03-23T09:00:00.000Z",
            ends_at: null,
            all_day: false,
            notes: "Bring gels",
            training_plan_id: "plan-123",
            activity_plan: null,
          },
          error: null,
          isLoading: false,
        }),
      },
      create: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
    },
    trainingPlans: {
      getById: {
        useQuery: () => ({
          data: { id: "plan-123", name: "Spring Build" },
        }),
      },
    },
    routes: {
      get: {
        useQuery: () => ({ data: null }),
      },
      loadFull: {
        useQuery: () => ({ data: null }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: { items: [] },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        }),
      },
    },
  },
}));

describe("event detail provenance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows subtle training plan provenance and opens the source plan from the menu", () => {
    renderNative(<EventDetailScreen />);

    expect(screen.getByText("Event details")).toBeTruthy();
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Spring Build")).toBeTruthy();

    fireEvent.press(screen.getByTestId("event-detail-options-open-training-plan"));

    expect(mockNavigateTo).toHaveBeenCalledWith("/training-plan-detail?id=plan-123");
  });
});
