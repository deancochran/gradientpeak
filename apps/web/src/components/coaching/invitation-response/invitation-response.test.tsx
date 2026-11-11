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
  preview: {
    organizationName: "Peak",
    kind: "athlete",
    agreement: {
      version: "coaching-read-v1",
      digest: `sha256:${"a".repeat(64)}`,
      terms: "Read-only terms",
      scopes: ["basic_profile", "training", "activities", "metrics", "goals", "calendar"],
    },
  },
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
  await screen.findByRole("button", { name: /^Accept invitation/ });
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
    await screen.findByRole("button", { name: /^Accept invitation/ });
    const acceptButton = screen.getByRole("button", { name: /^Accept invitation/ });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);
    expect(mocks.accept).toHaveBeenCalledOnce();

    accept.resolve({ status: "accepted" });
    expect((await screen.findByText(/Invitation accepted/)).textContent).toContain(
      "Invitation accepted",
    );
  });

  it("reviews a verified inbox invitation without a token and retries the exact acknowledged ID", async () => {
    mocks.load.mockResolvedValue({ items: [firstInvitation], nextCursor: null, hasMore: false });
    mocks.accept
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ status: "accepted" });
    render(<InvitationResponse actorId="new-verified-account" />);
    fireEvent.click(await screen.findByRole("button", { name: "Review invitation" }));
    expect(mocks.preview).toHaveBeenCalledWith({
      data: { invitationId: firstInvitation.invitationId },
    });
    expect(mocks.accept).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "Accept invitation & share training data" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry accept invitation to reconcile" }),
    );
    await screen.findByText(/Invitation accepted\./);
    const expected = {
      data: {
        invitationId: firstInvitation.invitationId,
        acknowledgement: {
          accepted: true,
          version: readyPreview.preview.agreement.version,
          digest: readyPreview.preview.agreement.digest,
        },
      },
    };
    expect(mocks.accept).toHaveBeenNthCalledWith(1, expected);
    expect(mocks.accept).toHaveBeenNthCalledWith(2, expected);
  });

  it("previews a one-time handoff token without accepting it", async () => {
    render(<InvitationResponse actorId="actor-a" initialInvitationToken={firstToken} />);

    await screen.findByRole("button", { name: /^Accept invitation/ });
    expect(mocks.preview).toHaveBeenCalledWith({ data: { token: firstToken } });
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.decline).not.toHaveBeenCalled();
  });

  it("keeps the accepted staff receipt visible and links only to its receipt organization", async () => {
    const organizationId = "33333333-3333-4333-8333-333333333333";
    mocks.preview.mockResolvedValueOnce({
      status: "ready",
      preview: { organizationName: "Staff peak", kind: "staff", agreement: null },
    });
    mocks.accept.mockResolvedValueOnce({
      status: "accepted",
      receipt: { invitationId: firstInvitation.invitationId, organizationId, status: "accepted" },
    });
    render(<InvitationResponse actorId="staff-recipient" />);

    enterToken(firstToken);
    fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText(/Invitation accepted\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open organization" }).getAttribute("href")).toBe(
      `/organizations/${organizationId}`,
    );
  });

  it("retains staff scope for a reconciled acceptance receipt", async () => {
    const organizationId = "44444444-4444-4444-8444-444444444444";
    mocks.preview.mockResolvedValueOnce({
      status: "ready",
      preview: { organizationName: "Staff peak", kind: "staff", agreement: null },
    });
    mocks.accept.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce({
      status: "accepted",
      receipt: { invitationId: firstInvitation.invitationId, organizationId, status: "accepted" },
    });
    render(<InvitationResponse actorId="staff-recipient" />);

    enterToken(firstToken);
    fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry accept invitation to reconcile" }),
    );

    expect(await screen.findByText(/Invitation accepted\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open organization" }).getAttribute("href")).toBe(
      `/organizations/${organizationId}`,
    );
  });

  it("does not offer an organization action for an accepted athlete receipt", async () => {
    const organizationId = "55555555-5555-4555-8555-555555555555";
    mocks.accept.mockResolvedValueOnce({
      status: "accepted",
      receipt: { invitationId: firstInvitation.invitationId, organizationId, status: "accepted" },
    });
    render(<InvitationResponse actorId="athlete-recipient" />);

    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: /^Accept invitation/ }));

    expect(await screen.findByText(/Invitation accepted\./)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open organization" })).toBeNull();
  });

  it("ignores a late staff receipt after the actor changes", async () => {
    const accepted = deferred<{
      status: "accepted";
      receipt: { invitationId: string; organizationId: string; status: "accepted" };
    }>();
    mocks.preview.mockResolvedValueOnce({
      status: "ready",
      preview: { organizationName: "Staff peak", kind: "staff", agreement: null },
    });
    mocks.accept.mockReturnValueOnce(accepted.promise);
    const { rerender } = render(<InvitationResponse actorId="staff-recipient-a" />);

    enterToken(firstToken);
    fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
    rerender(<InvitationResponse actorId="staff-recipient-b" />);
    accepted.resolve({
      status: "accepted",
      receipt: {
        invitationId: firstInvitation.invitationId,
        organizationId: "66666666-6666-4666-8666-666666666666",
        status: "accepted",
      },
    });

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Open organization" })).toBeNull(),
    );
    expect(screen.queryByText(/Invitation accepted\./)).toBeNull();
  });

  it.each([
    ["Accept", "accept", "accepted"],
    ["Decline", "decline", "declined"],
  ] as const)("keeps the handoff secret for explicit %s under StrictMode", async (label, command, status) => {
    render(
      <StrictMode>
        <InvitationResponse actorId="actor-a" initialInvitationToken={firstToken} />
      </StrictMode>,
    );
    await screen.findByRole("button", { name: new RegExp(`^${label} invitation`) });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label} invitation`) }));
    await waitFor(() =>
      expect(mocks[command]).toHaveBeenCalledWith({
        data:
          command === "accept"
            ? {
                token: firstToken,
                acknowledgement: {
                  version: "coaching-read-v1",
                  digest: `sha256:${"a".repeat(64)}`,
                  accepted: true,
                },
              }
            : { token: firstToken },
      }),
    );
    expect(await screen.findByText(new RegExp(`Invitation ${status}`))).toBeTruthy();
  });

  it.each([
    "accept",
    "decline",
  ] as const)("retries a lost handoff %s with the exact secret in StrictMode", async (choice) => {
    mocks[choice].mockRejectedValueOnce(new Error("connection lost"));
    render(
      <StrictMode>
        <InvitationResponse actorId="actor-a" initialInvitationToken={firstToken} />
      </StrictMode>,
    );
    const label = choice === "accept" ? /^Accept invitation/ : "Decline invitation";
    fireEvent.click(await screen.findByRole("button", { name: label }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Retry ${choice} invitation to reconcile` }),
    );
    await waitFor(() => expect(mocks[choice]).toHaveBeenCalledTimes(2));
    expect(mocks[choice].mock.calls).toEqual(
      choice === "accept"
        ? [
            [
              {
                data: {
                  token: firstToken,
                  acknowledgement: {
                    version: "coaching-read-v1",
                    digest: `sha256:${"a".repeat(64)}`,
                    accepted: true,
                  },
                },
              },
            ],
            [
              {
                data: {
                  token: firstToken,
                  acknowledgement: {
                    version: "coaching-read-v1",
                    digest: `sha256:${"a".repeat(64)}`,
                    accepted: true,
                  },
                },
              },
            ],
          ]
        : [[{ data: { token: firstToken } }], [{ data: { token: firstToken } }]],
    );
  });

  it.each([
    "preview",
    "accept",
  ] as const)("fences a pending handoff %s after actor replacement", async (phase) => {
    const pendingPreview = deferred<typeof readyPreview>();
    const pendingAccept = deferred<{ status: "accepted" }>();
    if (phase === "preview") mocks.preview.mockReturnValueOnce(pendingPreview.promise);
    else mocks.accept.mockReturnValueOnce(pendingAccept.promise);
    const view = render(
      <StrictMode>
        <InvitationResponse actorId="actor-a" initialInvitationToken={firstToken} />
      </StrictMode>,
    );
    if (phase === "accept")
      fireEvent.click(await screen.findByRole("button", { name: /^Accept invitation/ }));
    view.rerender(
      <StrictMode>
        <InvitationResponse actorId="actor-b" initialInvitationToken={firstToken} />
      </StrictMode>,
    );
    pendingPreview.resolve(readyPreview);
    pendingAccept.resolve({ status: "accepted" });
    await waitFor(() => {
      expect((screen.getByLabelText("Invitation token") as HTMLInputElement).value).toBe("");
      expect(screen.queryByRole("button", { name: /^Accept invitation/ })).toBeNull();
      expect(screen.queryByText(/Invitation accepted/)).toBeNull();
    });
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("clears the preview and ignores an older deferred preview when the token changes", async () => {
    const preview = deferred<typeof readyPreview>();
    mocks.preview.mockReturnValueOnce(preview.promise);
    render(<InvitationResponse actorId="actor-a" />);

    enterToken(firstToken);
    fireEvent.click(screen.getByRole("button", { name: "Preview invitation" }));
    enterToken(secondToken);
    expect(screen.queryByRole("button", { name: /^Accept invitation/ })).toBeNull();

    preview.resolve(readyPreview);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Accept invitation/ })).toBeNull(),
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
    expect(screen.queryByRole("button", { name: /^Accept invitation/ })).toBeNull();
  });

  it("clears invitation state and ignores an old command acknowledgement after actor replacement", async () => {
    const accept = deferred<{ status: "accepted" }>();
    mocks.accept.mockReturnValueOnce(accept.promise);
    const { rerender } = render(<InvitationResponse actorId="actor-a" />);

    await previewInvitation();
    fireEvent.click(screen.getByRole("button", { name: /^Accept invitation/ }));
    expect(mocks.accept).toHaveBeenCalledOnce();
    rerender(<InvitationResponse actorId="actor-b" />);

    expect((screen.getByLabelText("Invitation token") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: /^Accept invitation/ })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${action} invitation`) }));

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
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${action} invitation`) }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      `could not confirm whether this invitation was ${receipt}`,
    );
    expect(screen.queryByRole("button", { name: /^Accept invitation/ })).toBeNull();
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
    expect(mocks[choice]).toHaveBeenLastCalledWith({
      data:
        choice === "accept"
          ? {
              token: firstToken,
              acknowledgement: {
                version: "coaching-read-v1",
                digest: `sha256:${"a".repeat(64)}`,
                accepted: true,
              },
            }
          : { token: firstToken },
    });
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
    fireEvent.click(screen.getByRole("button", { name: /^Accept invitation/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /^Accept invitation/ }));
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
