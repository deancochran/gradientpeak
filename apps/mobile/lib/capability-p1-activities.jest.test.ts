import { act, renderHook } from "@testing-library/react-native";
import { useEntityCommentsController } from "./hooks/useEntityCommentsController";
import { useResourceLike } from "./hooks/useResourceLike";

const likeMutate = jest.fn();
const commentMutate = jest.fn();
const refetch = jest.fn();

jest.mock("@/lib/api", () => ({
  api: {
    social: {
      toggleLike: { useMutation: () => ({ isPending: false, mutate: likeMutate }) },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0 }] },
          hasNextPage: false,
          isFetchingNextPage: false,
          refetch,
        }),
      },
      addComment: {
        useMutation: (options: { onSuccess: () => void }) => ({
          isPending: false,
          mutate: (...args: unknown[]) => {
            commentMutate(...args);
            options.onSuccess();
          },
        }),
      },
    },
  },
}));

describe("P1 activity social controllers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("optimistically likes an activity and posts trimmed comment text", async () => {
    const like = renderHook(() =>
      useResourceLike({ entityId: "11111111-1111-4111-8111-111111111111", entityType: "activity" }),
    );
    await act(async () => like.result.current.toggleLike());
    expect(like.result.current).toMatchObject({ isLiked: true, likeCount: 1 });
    expect(likeMutate).toHaveBeenCalledWith({
      entity_id: "11111111-1111-4111-8111-111111111111",
      entity_type: "activity",
    });

    const comments = renderHook(() =>
      useEntityCommentsController({
        entityId: "11111111-1111-1111-1111-111111111111",
        entityType: "activity",
      }),
    );
    await act(async () => comments.result.current.setNewComment("  Nice work  "));
    await act(async () => comments.result.current.handleAddComment());
    expect(commentMutate).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: "activity", content: "Nice work" }),
    );
    expect(refetch).toHaveBeenCalled();
  });
});
