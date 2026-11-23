// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  followUser: vi.fn(),
  invalidateRelationshipQueries: vi.fn(),
  unfollowUser: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock("@repo/api/react", () => ({
  invalidateRelationshipQueries: mocks.invalidateRelationshipQueries,
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

vi.mock("../../lib/api/client", () => ({ api: { useUtils: mocks.useUtils } }));
vi.mock("../../lib/contract-epoch", () => ({ contractEpochFormInputProps: {} }));
vi.mock("../../lib/social/server-actions", () => ({
  followUserAction: Object.assign((input: unknown) => mocks.followUser(input), {
    url: "/_serverFn/follow",
  }),
  unfollowUserAction: Object.assign((input: unknown) => mocks.unfollowUser(input), {
    url: "/_serverFn/unfollow",
  }),
}));

import { FollowActionForm } from "./follow-action-form";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("FollowActionForm", () => {
  const targetUserId = "11111111-1111-4111-8111-111111111111";

  function form() {
    const element = screen.getByRole("button", { name: "Follow" }).closest("form");
    if (!element) throw new Error("Follow form is missing");
    return element;
  }

  beforeEach(() => {
    mocks.followUser.mockReset();
    mocks.invalidateRelationshipQueries.mockReset();
    mocks.unfollowUser.mockReset();
    mocks.useUtils.mockReset();
    mocks.useUtils.mockReturnValue({});
  });

  afterEach(cleanup);

  it("starts one follow operation for immediate duplicate enhanced submits", () => {
    const request = deferred<void>();
    mocks.followUser.mockReturnValue(request.promise);
    render(
      <FollowActionForm
        isFollowing={false}
        isPending={false}
        redirectTo="/user/target"
        targetUserId={targetUserId}
      />,
    );

    act(() => {
      fireEvent.submit(form());
      fireEvent.submit(form());
    });

    expect(mocks.followUser).toHaveBeenCalledOnce();
    expect(mocks.followUser).toHaveBeenCalledWith({
      data: { redirectTo: "/user/target", target_user_id: targetUserId },
    });
    expect((screen.getByRole("button", { name: "Follow" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("releases the guard and exposes a transport error for a retry", async () => {
    mocks.followUser.mockRejectedValueOnce(new Error("Request failed"));
    mocks.followUser.mockResolvedValueOnce(undefined);
    render(
      <FollowActionForm
        isFollowing={false}
        isPending={false}
        redirectTo="/user/target"
        targetUserId={targetUserId}
      />,
    );

    fireEvent.submit(form());

    expect((await screen.findByRole("alert")).textContent).toBe("Request failed");
    expect((screen.getByRole("button", { name: "Follow" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.submit(form());
    await waitFor(() => expect(mocks.followUser).toHaveBeenCalledTimes(2));
  });

  it("retains the native POST form contract before enhancement", () => {
    render(
      <FollowActionForm
        isFollowing={false}
        isPending={false}
        redirectTo="/user/target"
        targetUserId={targetUserId}
      />,
    );

    expect(form().getAttribute("action")).toBe("/_serverFn/follow");
    expect(form().getAttribute("method")).toBe("post");
    expect(screen.getByDisplayValue(targetUserId).getAttribute("name")).toBe("target_user_id");
  });
});
