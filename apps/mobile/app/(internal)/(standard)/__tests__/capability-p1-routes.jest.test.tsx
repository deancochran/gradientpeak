import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateToMock = jest.fn();
const routerNavigateMock = jest.fn();
const routesListUseInfiniteQueryMock = jest.fn(() => ({
  data: {
    pages: [
      {
        items: [
          {
            id: "route-1",
            name: "River Loop",
            owner: undefined,
          },
        ],
        nextCursor: undefined,
      },
    ],
  },
  error: null,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false,
  refetch: jest.fn(),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back: jest.fn(), navigate: routerNavigateMock }),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  MapPin: createHost("MapPin"),
  Search: createHost("Search"),
  SlidersHorizontal: createHost("SlidersHorizontal"),
  X: createHost("X"),
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetFooter: createHost("BottomSheetFooter"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  ListSkeleton: createHost("ListSkeleton"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/HeaderAction", () => ({
  __esModule: true,
  HeaderTextAction: ({ onPress, testID }: { onPress: () => void; testID: string }) =>
    React.createElement("Pressable", { onPress, testID }),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: ({ onPress, route }: { onPress?: () => void; route: { name: string } }) =>
    React.createElement(
      "Pressable",
      { onPress, testID: "routes-list-route-card" },
      React.createElement("Text", null, route.name),
    ),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (item: never) => React.ReactNode;
  }) =>
    React.createElement(
      "View",
      null,
      data.map((item, index) =>
        React.createElement(React.Fragment, { key: index }, renderItem(item as never)),
      ),
    ),
}));
jest.mock("@/components/shared/IndexFilterSheet", () => ({
  __esModule: true,
  IndexFilterSheet: createHost("IndexFilterSheet"),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: { routes: { list: { useInfiniteQuery: routesListUseInfiniteQueryMock } } },
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));
jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));
jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailDeleteConfirmModal: createHost("DetailDeleteConfirmModal"),
  DetailScaffold: ({
    children,
    headerRight,
  }: React.PropsWithChildren<{ headerRight?: () => React.ReactNode }>) =>
    React.createElement("View", null, headerRight?.(), children),
  DetailOverflowMenu: ({
    actions,
  }: {
    actions: Array<{ label: string; onPress: () => void; testID: string }>;
  }) =>
    React.createElement(
      "View",
      null,
      actions.map((action) =>
        React.createElement(
          "Pressable",
          { key: action.testID, onPress: action.onPress, testID: action.testID },
          React.createElement("Text", null, action.label),
        ),
      ),
    ),
}));
jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: createHost("EntityCommentsSection"),
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: "profile-1" } }),
}));
jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useSessionView: () => null,
}));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useOptionalActivityRecorderService: () => null,
}));
jest.mock("@/lib/hooks/useEntityCommentsController", () => ({
  __esModule: true,
  useEntityCommentsController: () => ({
    addCommentPending: false,
    commentCount: 0,
    comments: [],
    hasMoreComments: false,
    isLoadingMoreComments: false,
    newComment: "",
    handleAddComment: jest.fn(),
    setNewComment: jest.fn(),
    loadMoreComments: jest.fn(),
  }),
}));
jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/lib/hooks/useResourceLike", () => ({
  __esModule: true,
  useResourceLike: () => ({
    isLiked: false,
    likeCount: 0,
    isPending: false,
    toggleLike: jest.fn(),
  }),
}));
jest.mock("@/lib/recording/recordingObjectActions", () => ({
  __esModule: true,
  resolveRecordingObjectAction: () => null,
  handleRecordingObjectAction: jest.fn(),
}));
jest.mock("@/lib/navigation/recordingNavigation", () => ({
  __esModule: true,
  returnToRecordScreen: jest.fn(),
}));
jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: createHost("EmptyState"),
  LoadingState: createHost("LoadingState"),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: ({ onPress, route }: { onPress?: () => void; route?: { name?: string } }) =>
    React.createElement(
      "Pressable",
      { onPress, testID: "routes-list-route-card" },
      React.createElement("Text", null, route?.name ?? "Route"),
    ),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ routes: { invalidate: jest.fn() } }),
    routes: {
      list: { useInfiniteQuery: routesListUseInfiniteQueryMock },
      get: {
        useQuery: () => ({
          data: {
            id: "route-1",
            name: "River Loop",
            profile_id: "profile-1",
            storage_state: "ready",
          },
          isLoading: false,
        }),
      },
      loadFull: { useQuery: () => ({ data: undefined, isFetching: false }) },
      delete: {},
    },
  },
}));

const RoutesListScreen = require("../routes-list").default;
const RouteDetailScreen = require("../route-detail").default;

describe("routes P1 capability boundaries", () => {
  beforeEach(() => {
    navigateToMock.mockReset();
    routerNavigateMock.mockReset();
    routesListUseInfiniteQueryMock.mockClear();
  });

  it("routes.browse-and-inspect opens a persisted route from the library", async () => {
    await renderNative(<RoutesListScreen />);

    await fireEvent.press(screen.getByTestId("routes-list-route-card"));

    expect(navigateToMock).toHaveBeenCalledWith("/route-detail?id=route-1");
  });

  it("routes.attach-to-calendar-event lets an athlete assign a route to an event", async () => {
    await renderNative(<RouteDetailScreen />);

    await fireEvent.press(screen.getByTestId("route-detail-options-attach-calendar-event"));

    expect(routerNavigateMock).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: expect.objectContaining({
        mode: "create",
        routeId: "route-1",
        routeName: "River Loop",
      }),
    });
  });
});
