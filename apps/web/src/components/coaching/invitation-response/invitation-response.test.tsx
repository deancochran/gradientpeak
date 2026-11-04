// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  decline: vi.fn(),
  load: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("../../../lib/coaching/invitation-response-server-functions", () => ({
  acceptOrganizationInvitation: mocks.accept,
  declineOrganizationInvitation: mocks.decline,
  loadMyOrganizationInvitations: mocks.load,
  previewOrganizationInvitation: mocks.preview,
}));

import { InvitationResponse } from "./invitation-response";

const firstToken = "a".repeat(43);
const secondToken = "b".repeat(43);
const readyPreview = {
  status: "ready" as const,
  preview: { organizationName: "Peak", kind: "athlete" },
};
const firstInvitation = {
  invitationId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-822222222222",
  kind: "athlete",
  requestedRole: "coach",
  status: "pending",
  expiresAt: "2026-11-04T00:00:00.000Z",
  createdAt: "2026-11-03T00:00:00.000Z",
};

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

function enterToken(token: string) {
  fireEvent.change(screen.getByLabelText("Invitation token"), { target: { value: token } });
}

async function previewInvitation(token = firstToken) {
  enterToken(token);
  fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));
  await screen.findByRole("button", { name: "Accept invitation" });
}

describe("InvitationResponse", () => {
  beforeEach(() => {
    mocks.load.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.preview.mockResolvedValue(readyPreview);
    mocks.accept.mockResolvedValue({ status: "accepted" });
    mocks.decline.mockResolvedValue({ status: "declined" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("submits each immediate preview and accept command only once in StrictMode", async () => {
    const preview = deferred<typeof readyPreview>();
    const accept = deferred<{ status: "accepted" }>();
    mocks.preview.mockReturnValueOnce(preview.promise);
    mocks.accept.mockReturnValueOnce(accept.promise);
    render(
      <StrictMode>
        <InvitationResponse actorId="actor-a" />
      </StrictMode>,
    );

    enterToken(firstToken);
    const previewButton = screen.getByRole("button", { name: "Preview invitation" });
    fireEvent.click(previewButton);
    fireEvent.click(previewButton);
    expect(mocks.preview).toHaveBeenCalledOnce();

    preview.resolve(readyPreview);
    await screen.findByRole("button", { name: "Accept invitation" });
    const acceptButton = screen.getByRole("button", { name: "Accept invitation" });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);
    expect(mocks.accept).toHaveBeenCalledOnce();

    accept.resolve({ status: "accepted" });
    expect((await screen.findByText(/Invitation accepted/)).textContent).toContain(
      "Invitation accepted",
    );
  });

  it("clears the preview and ignores an older deferred preview when the token changes", async () => {
    const preview = deferred<typeof readyPreview>();
    mocks.preview.mockReturnValueOnce(preview.promise);
    render(<InvitationResponse actorId="actor-a" />);

    enterToken(firstToken);
    fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));
    enterToken(secondToken);
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();

    preview.resolve(readyPreview);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull(),
    );
    expect((screen.getByLabelText("Invitation token") as HTMLInputElement).value).toBe(secondToken);
  });

  it("shows a retryable preview failure without an unhandled rejection", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("preview unavailable"));
    render(<InvitationResponse actorId="actor-a" />);

    enterToken(firstToken);
    fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "preview could not be confirmed",
    );
    expect(screen.getByRole("button", { name: "Retry preview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  });

  it("clears invitation state and ignores an old command acknowledgement after actor replacement", async () => {
    const accept = deferred<{ status: "accepted" }>();
    mocks.accept.mockReturnValueOnce(accept.promise);
    const { rerender } = render(<InvitationResponse actorId="actor-a" />);

    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(mocks.accept).toHaveBeenCalledOnce();
    rerender(<InvitationResponse actorId="actor-b" />);

    expect((screen.getByLabelText("Invitation token") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    accept.resolve({ status: "accepted" });
    await waitFor(() => expect(screen.queryByText(/Invitation accepted/)).toBeNull());
  });

  it.each([
    ["Accept", "accepted"],
    ["Decline", "declined"],
  ] as const)("keeps a durable %s receipt visible when the post-command inbox refresh fails", async (action, receipt) => {
    mocks.load.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false });
    mocks.load.mockRejectedValueOnce(new Error("inbox unavailable"));
    render(<InvitationResponse actorId="actor-a" />);

    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: `${action} invitation` }));

    expect((await screen.findByText(new RegExp(`Invitation ${receipt}`))).textContent).toContain(
      `Invitation ${receipt}`,
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(screen.getByText(new RegExp(`Invitation ${receipt}`))).toBeTruthy();
  });

  it.each([
    ["Accept", "accept", "accepted"],
    ["Decline", "decline", "declined"],
  ] as const)("contains an unknown %s acknowledgement to an explicit same-command retry", async (action, choice, receipt) => {
    mocks[choice].mockRejectedValueOnce(new Error("connection lost"));
    render(<InvitationResponse actorId="actor-a" />);

    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: `${action} invitation` }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      `could not confirm whether this invitation was ${receipt}`,
    );
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
    const previewButton = screen.getByRole("button", { name: "Preview invitation" });
    expect((previewButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(previewButton);
    expect(screen.getByRole("alert").textContent).toContain(
      `could not confirm whether this invitation was ${receipt}`,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Retry ${choice} invitation to reconcile` }),
    );
    await waitFor(() => expect(mocks[choice]).toHaveBeenCalledTimes(2));
    expect(mocks[choice]).toHaveBeenLastCalledWith({ data: { token: firstToken } });
    expect((await screen.findByText(new RegExp(`Invitation ${receipt}`))).textContent).toContain(
      `Invitation ${receipt}`,
    );
  });

  it("keeps initial inbox failure distinct from a successfully loaded empty inbox", async () => {
    mocks.load.mockRejectedValueOnce(new Error("inbox unavailable"));
    render(<InvitationResponse actorId="actor-a" />);

    expect(screen.getByRole("status").textContent).toContain("Loading invitation summaries");
    expect((await screen.findByRole("alert")).textContent).toContain("could not be refreshed");
    expect(screen.queryByText("No invitation summaries.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry invitation summaries" }));
    expect(await screen.findByText("No invitation summaries.")).toBeTruthy();
  });

  it("renders safe invitation summaries and loads one bounded next page", async () => {
    mocks.load
      .mockResolvedValueOnce({ items: [firstInvitation], nextCursor: "page-2", hasMore: true })
      .mockResolvedValueOnce({
        items: [
          {
            ...firstInvitation,
            invitationId: "33333333-3333-4333-8333-333333333333",
            status: "declined",
          },
        ],
        nextCursor: null,
        hasMore: false,
      });
    render(<InvitationResponse actorId="actor-a" />);

    expect(
      (await screen.findByRole("list", { name: "Invitation summaries" })).textContent,
    ).toContain("athlete invitation · pending · coach");
    fireEvent.click(screen.getByRole("button", { name: "Next invitation summaries" }));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenLastCalledWith({ data: { limit: 20, cursor: "page-2" } }),
    );
    expect(
      (await screen.findByRole("list", { name: "Invitation summaries" })).textContent,
    ).toContain("athlete invitation · declined · coach");
    expect(screen.queryByRole("button", { name: "Next invitation summaries" })).toBeNull();
  });

  it("replaces a pending initial inbox request after a durable command", async () => {
    const initialPage = deferred<{
      items: Array<typeof firstInvitation>;
      nextCursor: null;
      hasMore: false;
    }>();
    const refreshedPage = deferred<{
      items: Array<typeof firstInvitation>;
      nextCursor: null;
      hasMore: false;
    }>();
    mocks.load.mockReturnValueOnce(initialPage.promise).mockReturnValueOnce(refreshedPage.promise);
    render(<InvitationResponse actorId="actor-a" />);

    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    initialPage.resolve({
      items: [{ ...firstInvitation, status: "old" }],
      nextCursor: null,
      hasMore: false,
    });
    await waitFor(() => expect(screen.queryByText(/old/)).toBeNull());
    refreshedPage.resolve({
      items: [{ ...firstInvitation, status: "accepted" }],
      nextCursor: null,
      hasMore: false,
    });

    expect((await screen.findByText(/Invitation accepted/)).textContent).toContain(
      "Invitation accepted",
    );
    expect(
      (await screen.findByRole("list", { name: "Invitation summaries" })).textContent,
    ).toContain("athlete invitation · accepted · coach");
  });

  it("replaces a pending next-page request after a durable command", async () => {
    const nextPage = deferred<{
      items: Array<typeof firstInvitation>;
      nextCursor: null;
      hasMore: false;
    }>();
    const refreshedPage = deferred<{
      items: Array<typeof firstInvitation>;
      nextCursor: null;
      hasMore: false;
    }>();
    mocks.load
      .mockResolvedValueOnce({ items: [firstInvitation], nextCursor: "page-2", hasMore: true })
      .mockReturnValueOnce(nextPage.promise)
      .mockReturnValueOnce(refreshedPage.promise);
    render(<InvitationResponse actorId="actor-a" />);

    await screen.findByRole("button", { name: "Next invitation summaries" });
    fireEvent.click(screen.getByRole("button", { name: "Next invitation summaries" }));
    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    nextPage.resolve({
      items: [{ ...firstInvitation, status: "old" }],
      nextCursor: null,
      hasMore: false,
    });
    await waitFor(() => expect(screen.queryByText(/old/)).toBeNull());
    refreshedPage.resolve({
      items: [{ ...firstInvitation, status: "accepted" }],
      nextCursor: null,
      hasMore: false,
    });

    expect((await screen.findByText(/Invitation accepted/)).textContent).toContain(
      "Invitation accepted",
    );
    expect(
      (await screen.findByRole("list", { name: "Invitation summaries" })).textContent,
    ).toContain("athlete invitation · accepted · coach");
  });
});
