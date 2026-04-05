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
          has_liked: false,
          likes_count: 0,
          template_visibility: "private",
        },
        router: { replace: jest.fn() },
        utils: {} as any,
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
          has_liked: false,
          likes_count: 0,
          template_visibility: "private",
          name: "Plan",
        },
        router: { replace: jest.fn() },
        utils: {} as any,
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
