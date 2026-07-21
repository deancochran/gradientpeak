// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityCommentsCard } from "./activity-comments-card";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  queryError: false,
  refetch: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    social: {
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0 }] },
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isError: mocks.queryError,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      addComment: {
        useMutation: (options: {
          onError: (error: Error, variables: { content: string }) => void;
        }) => ({
          isPending: false,
          mutate: (variables: { content: string }) => {
            mocks.addComment(variables);
            options.onError(new Error("offline"), variables);
          },
        }),
      },
    },
  },
}));

beforeEach(() => {
  mocks.queryError = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityCommentsCard recovery", () => {
  it("preserves failed comment text and offers an explicit retry", () => {
    render(<ActivityCommentsCard activityId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Keep this coaching note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(screen.getByRole("alert").textContent).toContain("Your text is preserved");
    expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe(
      "Keep this coaching note",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry comment" }));
    expect(mocks.addComment).toHaveBeenCalledTimes(2);
  });

  it("distinguishes load failure from an empty comments list and retries", () => {
    mocks.queryError = true;
    render(<ActivityCommentsCard activityId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.queryByText("No comments yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try comments again" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
