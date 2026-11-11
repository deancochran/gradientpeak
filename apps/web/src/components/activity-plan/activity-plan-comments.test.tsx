// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityPlanComments } from "./activity-plan-comments";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refetch: vi.fn(), loading: false, error: false }));
vi.mock("../../lib/api/client", () => ({
  api: {
    social: {
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [] }] },
          isLoading: mocks.loading,
          isError: mocks.error,
          refetch: mocks.refetch,
        }),
      },
      addComment: { useMutation: () => ({ mutateAsync: mocks.post, isPending: false }) },
    },
  },
}));
beforeEach(() => {
  mocks.loading = false;
  mocks.error = false;
  mocks.post.mockReset();
  mocks.refetch.mockReset();
});
afterEach(cleanup);
it("shows loading/error and retries reads instead of reporting an empty comment list", () => {
  mocks.loading = true;
  const view = render(<ActivityPlanComments planId="11111111-1111-4111-8111-111111111111" />);
  expect(screen.getByRole("status").textContent).toContain("Loading comments");
  expect(screen.queryByText("No comments yet.")).toBeNull();
  mocks.loading = false;
  mocks.error = true;
  view.rerender(<ActivityPlanComments planId="11111111-1111-4111-8111-111111111111" />);
  fireEvent.click(screen.getByRole("button", { name: "Retry comments" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
  expect(mocks.post).not.toHaveBeenCalled();
});
it("freezes pending comments, retains a failed draft and retries the same comment identity", async () => {
  let reject!: (error: Error) => void;
  mocks.post
    .mockReturnValueOnce(
      new Promise((_done, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce({});
  render(<ActivityPlanComments planId="11111111-1111-4111-8111-111111111111" />);
  fireEvent.change(screen.getByLabelText("Add a comment"), {
    target: { value: "Keep this comment" },
  });
  const post = screen.getByRole("button", { name: "Post comment" });
  act(() => {
    fireEvent.click(post);
    fireEvent.click(post);
  });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).disabled).toBe(true);
  await act(async () => reject(new Error("Offline")));
  expect(screen.getByRole("alert").textContent).toContain("text is kept");
  expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe(
    "Keep this comment",
  );
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(mocks.post.mock.calls[1]?.[0]).toEqual(mocks.post.mock.calls[0]?.[0]);
  await waitFor(() =>
    expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe(""),
  );
});
