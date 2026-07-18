import { act, renderHook } from "@testing-library/react-native";

const alertMock = jest.fn();
const toggleLikeMutateMock = jest.fn();
const duplicateMutateMock = jest.fn();
const updateMutateMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  Alert: { alert: alertMock },
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
      update: {
        useMutation: () => ({ mutate: updateMutateMock, isPending: false }),
      },
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock, isPending: false }),
      },
    },
  },
}));

import { useTrainingPlanHeaderSocialActions } from "../useTrainingPlanHeaderSocialActions";

const emptyUtils = {} as Parameters<typeof useTrainingPlanHeaderSocialActions>[0]["utils"];

describe("useTrainingPlanHeaderSocialActions", () => {
  beforeEach(() => {
    alertMock.mockReset();
    toggleLikeMutateMock.mockReset();
    duplicateMutateMock.mockReset();
    updateMutateMock.mockReset();
  });

  it("blocks likes for invalid plan ids", () => {
    const { result } = renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "not-a-uuid",
          structure_hash: `v1:sha256:${"0".repeat(64)}`,
          has_liked: false,
          likes_count: 0,
          template_visibility: "private",
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    act(() => {
      result.current.handleToggleLike();
    });

    expect(require("react-native").Alert.alert as jest.Mock).toHaveBeenCalledWith(
      "Error",
      "Cannot like this item - invalid ID",
    );
    expect(toggleLikeMutateMock).not.toHaveBeenCalled();
  });

  it("optimistically toggles likes and dispatches the social mutation", () => {
    const { result } = renderHook(() =>
      useTrainingPlanHeaderSocialActions({
        plan: {
          id: "11111111-1111-1111-1111-111111111111",
          structure_hash: `v1:sha256:${"1".repeat(64)}`,
          has_liked: false,
          likes_count: 0,
          template_visibility: "private",
          name: "Plan",
        },
        router: { replace: jest.fn() },
        utils: emptyUtils,
      }),
    );

    act(() => {
      result.current.handleToggleLike();
    });

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "training_plan",
    });
    expect(result.current.isLiked).toBe(true);
    expect(result.current.likesCount).toBe(1);
  });
});
