import React from "react";
import { createHost } from "../../../../test/mock-components";
import { act, renderNative } from "../../../../test/render-native";

const mutate = jest.fn();
const back = jest.fn();
let mutationOptions: { onSuccess?: () => void } | undefined;
let deletePress: (() => void) | undefined;
let confirmPress: (() => void) | undefined;

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back, navigate: jest.fn() }),
}));
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));
jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailScaffold: ({
    children,
    headerRight,
    modals,
  }: React.PropsWithChildren<{
    headerRight?: () => React.ReactNode;
    modals?: React.ReactNode;
  }>) => (
    <>
      {headerRight?.()}
      {children}
      {modals}
    </>
  ),
  DetailOverflowMenu: ({
    actions,
  }: {
    actions: Array<{ label: string; onPress: () => void; testID?: string }>;
  }) => {
    deletePress = actions.find((action) => action.label === "Delete Route")?.onPress;
    return (
      <>
        {actions.map((action) => (
          <React.Fragment key={action.label}>
            {React.createElement("Text", null, action.label)}
          </React.Fragment>
        ))}
      </>
    );
  },
  DetailDeleteConfirmModal: ({
    onConfirm,
    entityName,
  }: {
    onConfirm: () => void;
    entityName: string;
  }) => {
    confirmPress = onConfirm;
    return <>{React.createElement("Text", null, `Confirm delete ${entityName}`)}</>;
  },
}));
jest.mock("@/components/shared/RouteCard", () => ({ RouteCard: createHost("RouteCard") }));
jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));
jest.mock("@/components/social/EntityCommentsSection", () => ({
  EntityCommentsSection: createHost("EntityCommentsSection"),
}));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
jest.mock("@/lib/hooks/useActivityRecorder", () => ({ useSessionView: () => null }));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  useOptionalActivityRecorderService: () => null,
}));
jest.mock("@/lib/hooks/useEntityCommentsController", () => ({
  useEntityCommentsController: () => ({
    comments: [],
    commentCount: 0,
    hasMoreComments: false,
    isLoadingMoreComments: false,
    isLoadingMore: false,
    newComment: "",
    addCommentPending: false,
    handleAddComment: jest.fn(),
    setNewComment: jest.fn(),
    loadMoreComments: jest.fn(),
  }),
}));
jest.mock("@/lib/hooks/useResourceLike", () => ({
  useResourceLike: () => ({
    isLiked: false,
    likeCount: 0,
    isPending: false,
    toggleLike: jest.fn(),
  }),
}));
jest.mock("@/lib/navigation/recordingNavigation", () => ({ returnToRecordScreen: jest.fn() }));
jest.mock("@/lib/recording/recordingObjectActions", () => ({
  resolveRecordingObjectAction: () => null,
  handleRecordingObjectAction: jest.fn(),
}));
jest.mock("@/lib/hooks/useReliableMutation", () => ({
  useReliableMutation: (_mutation: unknown, options: { onSuccess?: () => void }) => {
    mutationOptions = options;
    return { mutate, isPending: false };
  },
}));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({
      routes: { get: { invalidate: jest.fn(), reset: jest.fn() }, invalidate: jest.fn() },
    }),
    routes: {
      get: {
        useQuery: () => ({
          data: {
            id: "route-1",
            name: "River Loop",
            profile_id: "owner-1",
            storage_state: "ready",
            description: null,
            total_distance: 1000,
            total_ascent: 20,
            total_descent: 18,
            polyline: "encoded",
            likes_count: 0,
            has_liked: false,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          isLoading: false,
        }),
      },
      loadFull: { useQuery: () => ({ data: undefined, isFetching: false }) },
      delete: {},
    },
  },
}));
jest.mock("lucide-react-native", () => ({
  Ellipsis: createHost("Ellipsis"),
  Heart: createHost("Heart"),
}));

const RouteDetailScreen = require("../route-detail").default;

describe("P0 route deletion boundary", () => {
  beforeEach(() => {
    mutate.mockReset();
    back.mockReset();
    mutationOptions = undefined;
    deletePress = undefined;
    confirmPress = undefined;
  });

  it("confirms an owned route deletion through the route mutation boundary", async () => {
    await renderNative(<RouteDetailScreen />);
    await act(() => deletePress?.());
    await act(() => confirmPress?.());

    expect(mutate).toHaveBeenCalledWith({ id: "route-1" });
  });

  it("returns to the route library after deletion succeeds", async () => {
    await renderNative(<RouteDetailScreen />);
    mutationOptions?.onSuccess?.();
    expect(back).toHaveBeenCalled();
  });
});
