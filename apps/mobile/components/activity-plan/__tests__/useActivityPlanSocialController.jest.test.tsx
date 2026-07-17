const alertMock = jest.fn();
const shareMock = jest.fn();
const toggleLikeMutateMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
  Share: { share: shareMock },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock, isPending: false }),
      },
    },
  },
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

const { act, renderHook } =
  require("@testing-library/react-native") as typeof import("@testing-library/react-native");
const ReactNative = require("react-native") as typeof import("react-native");
Object.defineProperty(ReactNative, "Share", { configurable: true, value: { share: shareMock } });
const { useActivityPlanSocialController } =
  require("../useActivityPlanSocialController") as typeof import("../useActivityPlanSocialController");

describe("useActivityPlanSocialController", () => {
  beforeEach(() => {
    alertMock.mockReset();
    (ReactNative.Alert.alert as jest.Mock).mockReset();
    shareMock.mockReset();
    toggleLikeMutateMock.mockReset();
  });

  it("shows an error alert when toggling like with an invalid plan ID", () => {
    const { result } = renderHook(() =>
      useActivityPlanSocialController({
        planId: "not-a-valid-uuid",
      }),
    );

    act(() => {
      result.current.handleToggleLike();
    });

    expect(ReactNative.Alert.alert as jest.Mock).toHaveBeenCalledWith(
      "Error",
      "Cannot like this item - invalid ID",
    );
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();
  });

  it("toggles like for a valid activity plan", () => {
    const { result } = renderHook(() =>
      useActivityPlanSocialController({
        planId: "11111111-1111-1111-1111-111111111111",
      }),
    );

    expect(result.current.isLiked).toBe(false);
    expect(result.current.likesCount).toBe(0);

    act(() => {
      result.current.handleToggleLike();
    });

    expect(result.current.isLiked).toBe(true);
    expect(result.current.likesCount).toBe(1);
    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "activity_plan",
    });
  });
});
