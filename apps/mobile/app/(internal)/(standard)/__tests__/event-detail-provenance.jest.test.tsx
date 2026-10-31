import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";
import EventDetailScreen from "../event-detail";

const mockNavigateTo = jest.fn();

type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
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
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@repo/api/react", () => ({
  __esModule: true,
  usePlannedSessionMutations: () => ({
    changePlanOnly: { isPending: false, mutateAsync: jest.fn() },
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
    useUtils: () => ({ events: { invalidate: jest.fn(async () => undefined) } }),
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
      update: {
        useMutation: () => ({ isPending: false, mutate: jest.fn() }),
      },
    },
    activities: {
      createManualDiaryEntry: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
    },
    plannedSessions: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
      skip: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      recordingLaunch: { useMutation: () => ({ mutateAsync: jest.fn() }) },
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
    trainingPlans: {
      get: {
        useQuery: () => ({
          data: { id: "plan-123", name: "Spring Build" },
        }),
      },
    },
    routes: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [] }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
        }),
      },
      get: {
        useQuery: () => ({ data: null }),
      },
      loadFull: {
        useQuery: () => ({ data: null }),
      },
    },
    activityPlans: {
      getById: {
        useQuery: () => ({ data: null, error: null, isLoading: false }),
      },
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [] }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          isLoading: false,
        }),
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

  it("does not expose executable-plan provenance on generic event records", async () => {
    await renderNative(<EventDetailScreen />);

    expect(screen.queryByText("Event details")).toBeNull();
    expect(screen.queryByText("Source")).toBeNull();
    expect(screen.queryByText("Spring Build")).toBeNull();
    expect(screen.queryByTestId("event-detail-options-open-training-plan")).toBeNull();
    expect(screen.queryByTestId("event-detail-source-training-plan")).toBeNull();
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });
});
