import { act, renderHook } from "@testing-library/react-native";

const alertMock = jest.fn();
const toggleLikeMutateMock = jest.fn();
const toggleLikeMutateAsyncMock = jest.fn();
const duplicateMutateMock = jest.fn();
const commitMutateAsyncMock = jest.fn();
const shareMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  Alert: { alert: alertMock },
  Share: { share: shareMock },
}));

jest.mock("@repo/api/react", () => ({
  __esModule: true,
  invalidateTrainingPlanQueries: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      duplicate: {
        useMutation: () => ({ mutate: duplicateMutateMock, isPending: false }),
      },
      commit: {
        useMutation: () => ({ mutateAsync: commitMutateAsyncMock, isPending: false }),
      },
    },
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

import { useTrainingPlanHeaderSocialActions } from "../useTrainingPlanHeaderSocialActions";

const emptyUtils = {} as Parameters<typeof useTrainingPlanHeaderSocialActions>[0]["utils"];
const ReactNative = require("react-native") as typeof import("react-native");
Object.defineProperty(ReactNative, "Share", { configurable: true, value: { share: shareMock } });

describe("useTrainingPlanHeaderSocialActions", () => {
  beforeEach(() => {
    alertMock.mockReset();
    (ReactNative.Alert.alert as jest.Mock).mockReset();
    toggleLikeMutateMock.mockReset();
    toggleLikeMutateAsyncMock.mockReset().mockResolvedValue(undefined);
    duplicateMutateMock.mockReset();
    commitMutateAsyncMock.mockReset();
    shareMock.mockReset();
  });

  it("blocks likes for invalid plan ids", async () => {
    const { result } = await renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "not-a-uuid",
          structure_hash: `v1:sha256:${"0".repeat(64)}`,
          has_liked: false,
          likes_count: 0,
          content_visibility: "private",
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    await act(async () => {
      await result.current.handleToggleLike();
    });

    expect(require("react-native").Alert.alert as jest.Mock).toHaveBeenCalledWith(
      "Error",
      "Cannot like this item - invalid ID",
    );
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();
  });

  it("optimistically toggles likes and dispatches the social mutation", async () => {
    const { result } = await renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "11111111-1111-1111-1111-111111111111",
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
          has_liked: false,
          likes_count: 0,
          content_visibility: "private",
          name: "Plan",
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    await act(async () => {
      await result.current.handleToggleLike();
    });

    expect(toggleLikeMutateAsyncMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "training_plan",
    });
    expect(result.current.isLiked).toBe(true);
    expect(result.current.likesCount).toBe(1);
  });

  it("prevents overlapping like toggles while the mutation is pending", async () => {
    let resolveMutation: (() => void) | undefined;
    toggleLikeMutateAsyncMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const { result } = await renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "11111111-1111-1111-1111-111111111111",
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    await act(() => {
      void result.current.handleToggleLike();
      void result.current.handleToggleLike();
    });
    expect(toggleLikeMutateAsyncMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveMutation?.();
    });
  });

  it("reports a share-sheet failure", async () => {
    shareMock.mockRejectedValueOnce(new Error("unavailable"));
    const { result } = await renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "11111111-1111-1111-1111-111111111111",
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
          content_visibility: "public",
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
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

  it("uses the configured public web origin for training-plan shares", async () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.gradientpeak.test";
    process.env.EXPO_PUBLIC_WEB_URL = "https://share.gradientpeak.test";
    shareMock.mockResolvedValueOnce(undefined);
    const { result } = await renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "11111111-1111-1111-1111-111111111111",
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
          content_visibility: "public",
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(shareMock).toHaveBeenCalledWith({
      message:
        "https://share.gradientpeak.test/share/training-plans/11111111-1111-1111-1111-111111111111",
      url: "https://share.gradientpeak.test/share/training-plans/11111111-1111-1111-1111-111111111111",
    });
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_WEB_URL;
  });

  it("directs private sharing to the editor without committing visibility", async () => {
    const { result } = await renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "11111111-1111-1111-1111-111111111111",
          structure: {},
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
          content_visibility: "private",
          editor: { revision: 1, structureHash: `v1:sha256:${"1".repeat(64)}` },
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    await act(async () => {
      await result.current.handleShare();
    });
    expect(shareMock).not.toHaveBeenCalled();
    expect(ReactNative.Alert.alert as jest.Mock).toHaveBeenLastCalledWith(
      "Not public",
      "Only public training plans have a share link. Use Edit plan to set visibility to Public.",
    );

    expect(commitMutateAsyncMock).not.toHaveBeenCalled();
    expect(result.current).not.toHaveProperty("handleChangeVisibility");
  });
});
