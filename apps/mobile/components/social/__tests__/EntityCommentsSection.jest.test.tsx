import React from "react";
import { createButtonComponent, createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { EntityCommentsSection } from "../EntityCommentsSection";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));
jest.mock("@/components/shared/EntityOwnerRow", () => ({
  __esModule: true,
  EntityOwnerRow: createHost("EntityOwnerRow"),
}));

const baseProps = {
  addCommentPending: false,
  commentCount: 0,
  comments: [],
  commentsError: null,
  isLoadingComments: false,
  newComment: "",
  onAddComment: jest.fn(),
  onChangeNewComment: jest.fn(),
  testIDPrefix: "comments",
};

describe("EntityCommentsSection", () => {
  it("shows initial loading instead of an empty state", async () => {
    await renderNative(<EntityCommentsSection {...baseProps} isLoadingComments />);

    expect(screen.getByTestId("comments-comments-loading")).toBeTruthy();
    expect(screen.queryByText("No comments yet.")).toBeNull();
  });

  it("shows a query error instead of an empty state", async () => {
    await renderNative(
      <EntityCommentsSection {...baseProps} commentsError="Network unavailable" />,
    );

    expect(screen.getByTestId("comments-comments-error")).toBeTruthy();
    expect(screen.queryByText("No comments yet.")).toBeNull();
  });

  it("shows an empty state only after a successful empty load", async () => {
    await renderNative(<EntityCommentsSection {...baseProps} />);

    expect(screen.getByText("No comments yet.")).toBeTruthy();
  });

  it("submits a non-empty comment through the supplied action", async () => {
    const onAddComment = jest.fn();
    await renderNative(
      <EntityCommentsSection {...baseProps} newComment="Nice work" onAddComment={onAddComment} />,
    );

    await fireEvent.press(screen.getByTestId("comments-add-comment-button"));
    expect(onAddComment).toHaveBeenCalledTimes(1);
  });
});
