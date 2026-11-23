import { Pressable } from "react-native";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import {
  EntityCommentsSheetProvider,
  useEntityCommentsSheet,
} from "../EntityCommentsSheetProvider";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  APP_BOTTOM_SHEET_PRESENTATIONS: { inspector: { initialSnapIndex: 0, snapPoints: ["82%"] } },
  AppBottomSheet: createHost("AppBottomSheet"),
}));
jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: createHost("EntityCommentsSection"),
}));
jest.mock("@/lib/hooks/useEntityCommentsController", () => ({
  __esModule: true,
  useEntityCommentsController: jest.fn(() => ({
    addCommentPending: false,
    commentCount: 0,
    comments: [],
    commentsError: null,
    handleAddComment: jest.fn(),
    hasMoreComments: false,
    isLoadingComments: false,
    isLoadingMoreComments: false,
    loadMoreComments: jest.fn(),
    newComment: "",
    setNewComment: jest.fn(),
  })),
}));

const mockUseEntityCommentsController = jest.requireMock<{
  useEntityCommentsController: jest.Mock;
}>("@/lib/hooks/useEntityCommentsController").useEntityCommentsController;

function OpenCommentsButton() {
  const commentsSheet = useEntityCommentsSheet();

  return (
    <Pressable
      onPress={() =>
        commentsSheet?.openEntityComments({
          entityId: "00000000-0000-4000-8000-000000000001",
          entityType: "activity_plan",
        })
      }
      testID="open-comments"
    />
  );
}

describe("EntityCommentsSheetProvider", () => {
  beforeEach(() => {
    mockUseEntityCommentsController.mockClear();
  });

  it("does not mount comment query or sheet state until comments are opened", async () => {
    await renderNative(
      <EntityCommentsSheetProvider>
        <OpenCommentsButton />
      </EntityCommentsSheetProvider>,
    );

    expect(mockUseEntityCommentsController).not.toHaveBeenCalled();
    expect(screen.queryByTestId("entity-comments-sheet")).toBeNull();

    await fireEvent.press(screen.getByTestId("open-comments"));

    expect(mockUseEntityCommentsController).toHaveBeenCalledWith({
      entityId: "00000000-0000-4000-8000-000000000001",
      entityType: "activity_plan",
    });
    expect(screen.getByTestId("entity-comments-sheet")).toBeTruthy();
  });
});
