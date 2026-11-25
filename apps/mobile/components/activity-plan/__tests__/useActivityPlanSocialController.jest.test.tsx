const alertMock = jest.fn();
const shareMock = jest.fn();
const toggleLikeMutateMock = jest.fn();
const toggleLikeMutateAsyncMock = jest.fn();

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
        useMutation: () => ({
          mutate: toggleLikeMutateMock,
          mutateAsync: toggleLikeMutateAsyncMock,
          isPending: false,
        }),
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
    toggleLikeMutateAsyncMock.mockReset().mockResolvedValue(undefined);
  });

  it("shows an error alert when toggling like with an invalid plan ID", async () => {
    const { result } = await renderHook(() =>
      useActivityPlanSocialController({
        planId: "not-a-valid-uuid",
      }),
    );

    await act(async () => {
      await result.current.handleToggleLike();
    });

    expect(ReactNative.Alert.alert as jest.Mock).toHaveBeenCalledWith(
      "Error",
      "Cannot like this item - invalid ID",
    );
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();
  });

  it("toggles like for a valid activity plan", async () => {
    const { result } = await renderHook(() =>
      useActivityPlanSocialController({
        planId: "11111111-1111-1111-1111-111111111111",
      }),
    );

    expect(result.current.isLiked).toBe(false);
    expect(result.current.likesCount).toBe(0);

    await act(async () => {
      await result.current.handleToggleLike();
    });

    expect(result.current.isLiked).toBe(true);
    expect(result.current.likesCount).toBe(1);
    expect(toggleLikeMutateAsyncMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "activity_plan",
    });
  });

  it("prevents overlapping optimistic like toggles while the mutation is pending", async () => {
    let resolveMutation: (() => void) | undefined;
    toggleLikeMutateAsyncMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const { result } = await renderHook(() =>
      useActivityPlanSocialController({ planId: "11111111-1111-1111-1111-111111111111" }),
    );

    await act(() => {
      void result.current.handleToggleLike();
      void result.current.handleToggleLike();
    });

    expect(result.current.isLikePending).toBe(true);
    expect(toggleLikeMutateAsyncMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveMutation?.();
    });
    expect(result.current.isLikePending).toBe(false);
  });

  it("reports a share-sheet failure", async () => {
    shareMock.mockRejectedValueOnce(new Error("unavailable"));
    const { result } = await renderHook(() =>
      useActivityPlanSocialController({
        contentVisibility: "public",
        planId: "11111111-1111-1111-1111-111111111111",
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(ReactNative.Alert.alert as jest.Mock).toHaveBeenCalledWith(
      "Share failed",
      "Could not open the share sheet. Please try again.",
    );
  });

  it("uses the configured public web origin for activity-plan shares", async () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.gradientpeak.test";
    process.env.EXPO_PUBLIC_WEB_URL = "https://share.gradientpeak.test";
    shareMock.mockResolvedValueOnce(undefined);
    const { result } = await renderHook(() =>
      useActivityPlanSocialController({
        contentVisibility: "public",
        planId: "11111111-1111-1111-1111-111111111111",
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(shareMock).toHaveBeenCalledWith({
      message:
        "https://share.gradientpeak.test/share/activity-plans/11111111-1111-1111-1111-111111111111",
      url: "https://share.gradientpeak.test/share/activity-plans/11111111-1111-1111-1111-111111111111",
    });
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_WEB_URL;
  });
});
