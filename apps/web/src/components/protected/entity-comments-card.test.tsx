// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityCommentsCard } from "./entity-comments-card";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    social: {
      addComment: {
        useMutation: (options: {
          onError: (error: Error, variables: { comment_id?: string; content: string }) => void;
          retry: boolean;
        }) => ({
          isPending: false,
          mutate: (variables: { comment_id?: string; content: string }) => {
            mocks.addComment(variables);
            expect(options.retry).toBe(false);
            options.onError(new Error("offline"), variables);
          },
        }),
      },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0 }] },
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          refetch: mocks.refetch,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EntityCommentsCard", () => {
  it("preserves failed text and exposes a deliberate retry without automatic mutation retry", () => {
    render(
      <EntityCommentsCard
        entityId="11111111-1111-4111-8111-111111111111"
        entityType="activity"
        helperText="Discuss the activity."
        testId="activity-comments"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Add a comment" });
    fireEvent.change(input, { target: { value: "Keep this note" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(screen.getByRole("alert").textContent).toContain("Your text is preserved");
    expect((input as HTMLTextAreaElement).value).toBe("Keep this note");
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry comment" }));
    expect(mocks.addComment).toHaveBeenCalledTimes(3);
    expect(mocks.addComment.mock.calls[0]?.[0].comment_id).toBe(
      mocks.addComment.mock.calls[1]?.[0].comment_id,
    );
    expect(mocks.addComment.mock.calls[0]?.[0].comment_id).toBe(
      mocks.addComment.mock.calls[2]?.[0].comment_id,
    );
  });
});
