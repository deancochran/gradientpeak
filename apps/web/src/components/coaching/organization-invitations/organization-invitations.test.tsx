// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type InvitationPage, OrganizationInvitations } from "./organization-invitations";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));
vi.mock("../../../lib/coaching/organization-invitations-server-functions", () => ({
  createOrganizationInvitation: mocks.create,
  revokeOrganizationInvitation: mocks.revoke,
  resolveAcceptedOrganizationInvitationRelationship: mocks.inspect,
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";
const page: InvitationPage = { items: [], nextCursor: null, hasMore: false };
const created = {
  status: "created" as const,
  invitation: {
    invitationId,
    token: "one-time-token",
    createdAt: "2029-01-01T00:00:00.000Z",
    expiresAt: "2030-01-01T00:00:00.000Z",
  },
};

describe("organization invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidate.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(created);
    mocks.inspect.mockResolvedValue({
      status: "granted",
      relationship: { relationshipState: "staff_suspended", navigationTarget: "staff_roster" },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  function renderPage(
    overrides: Partial<InvitationPage> = {},
    actorProfileId = "profile-1",
    canInviteAdministrators = true,
  ) {
    return render(
      <OrganizationInvitations
        actorProfileId={actorProfileId}
        canInviteAdministrators={canInviteAdministrators}
        organizationId={organizationId}
        page={{ ...page, ...overrides }}
      />,
      { wrapper: StrictMode },
    );
  }
  async function submit() {
    fireEvent.change(screen.getByLabelText("Recipient email"), {
      target: { value: "person@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Expires at"), {
      target: { value: "2030-01-01T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  }
  it("sends the athlete/null role discriminant with email as the sole recipient", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Invitation type"), { target: { value: "athlete" } });
    await submit();
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        kind: "athlete",
        requestedRole: null,
        recipientProfileId: null,
        recipientEmail: "person@example.test",
      }),
    });
  });
  it("single-flights duplicate submit events", async () => {
    let resolve!: (value: typeof created) => void;
    mocks.create.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("Recipient email"), {
      target: { value: "person@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Expires at"), {
      target: { value: "2030-01-01T12:00" },
    });
    const button = screen.getByRole("button", { name: "Create invitation" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    resolve(created);
  });
  it("does not automatically replay an uncertain creation and retains the draft", async () => {
    mocks.create.mockRejectedValue(new Error("connection lost"));
    renderPage();
    await submit();
    expect(screen.getByRole("alert").textContent).toMatch(/could not confirm/i);
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(mocks.create).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Recipient email") as HTMLInputElement).value).toBe(
      "person@example.test",
    );
  });
  it("copies a returned fragment invitation link without clearing the selectable fallback", async () => {
    renderPage();
    await submit();
    const link = screen.getByLabelText("Invitation link") as HTMLInputElement;
    expect(link.value).toContain("/organization-invitation#invitation=one-time-token");
    fireEvent.click(screen.getByRole("button", { name: "Copy invitation link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value));
    expect((screen.getByLabelText("Invitation link") as HTMLInputElement).value).toBe(link.value);
  });
  it("retains the token but locks actions when refresh fails after a committed create", async () => {
    mocks.invalidate.mockRejectedValue(new Error("refresh failed"));
    renderPage();
    await submit();
    await waitFor(() => expect(screen.getByLabelText("Invitation link")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Create invitation" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
  it("copying during a pending create refresh cannot suppress its failure lock", async () => {
    let rejectRefresh!: (error: Error) => void;
    mocks.invalidate.mockReturnValue(
      new Promise((_, reject) => {
        rejectRefresh = reject;
      }),
    );
    renderPage();
    await submit();
    await waitFor(() => expect(screen.getByLabelText("Invitation link")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Copy invitation link" }));
    await act(async () => {
      rejectRefresh(new Error("refresh failed"));
    });
    expect(screen.getByRole("button", { name: "Create invitation" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Refresh invitations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("clears a visible token when the same organization receives a replacement actor", async () => {
    const view = renderPage();
    await submit();
    view.rerender(
      <OrganizationInvitations
        actorProfileId="profile-2"
        canInviteAdministrators
        organizationId={organizationId}
        page={page}
      />,
    );
    expect(screen.queryByLabelText("Invitation link")).toBeNull();
  });
  it("fences a late create completion after actor replacement", async () => {
    let resolve!: (value: typeof created) => void;
    mocks.create.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = renderPage();
    await submit();
    view.rerender(
      <OrganizationInvitations
        actorProfileId="profile-2"
        canInviteAdministrators
        organizationId={organizationId}
        page={page}
      />,
    );
    resolve(created);
    await Promise.resolve();
    expect(screen.queryByLabelText("Invitation link")).toBeNull();
  });
  it("allows coach invitation revocation but restricts administrator actions for non-root admins", () => {
    renderPage(
      {
        items: [
          {
            invitationId,
            organizationId,
            kind: "staff",
            requestedRole: "coach",
            status: "pending",
            createdAt: "2029-01-01T00:00:00.000Z",
            expiresAt: "2030-01-01T00:00:00.000Z",
          },
        ],
      },
      "profile-1",
      false,
    );
    expect(screen.getByRole("button", { name: "Revoke invitation" })).toBeTruthy();
    expect(
      (screen.getByRole("option", { name: "Administrator" }) as HTMLOptionElement).disabled,
    ).toBe(true);
  });
  it("never offers revocation for terminal ISO-summary statuses", () => {
    renderPage({
      items: (["accepted", "declined", "revoked", "expired"] as const).map((status, index) => ({
        invitationId: `22222222-2222-4222-8222-22222222222${index}`,
        organizationId,
        kind: "athlete",
        requestedRole: null,
        status,
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2030-01-01T00:00:00.000Z",
      })),
    });
    expect(screen.queryByRole("button", { name: "Revoke invitation" })).toBeNull();
  });
  it("offers a read-only accepted relationship inspection without exposing recipient identity", async () => {
    renderPage({
      items: [
        {
          invitationId,
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          status: "accepted",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect accepted relationship" }));
    await waitFor(() =>
      expect(mocks.inspect).toHaveBeenCalledWith({ data: { organizationId, invitationId } }),
    );
    expect(screen.getByText(/staff suspended/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage staff memberships" }).className).toContain(
      "bg-slate-950",
    );
    expect(screen.getByRole("link", { name: "Manage staff memberships" }).className).toContain(
      "text-cyan-200",
    );
    expect(
      screen.getByRole("button", { name: "Inspect accepted relationship" }).className,
    ).toContain("bg-slate-950");
    expect(
      screen.getByRole("button", { name: "Inspect accepted relationship" }).className,
    ).toContain("text-cyan-200");
    expect(document.body.textContent).not.toContain("person@example.test");
  });
  it("uses staff-specific copy and offers no roster navigation for an accepted roleless membership", async () => {
    mocks.inspect.mockResolvedValue({
      status: "granted",
      relationship: { relationshipState: "staff_no_effective_role", navigationTarget: "none" },
    });
    renderPage({
      items: [
        {
          invitationId,
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          status: "accepted",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect accepted relationship" }));
    await waitFor(() =>
      expect(screen.getByText(/staff membership is not currently available/i)).toBeTruthy(),
    );
    expect(screen.queryByRole("link", { name: "Manage staff memberships" })).toBeNull();
    expect(screen.queryByText(/No athlete relationship-management destination/i)).toBeNull();
  });
  it("hides admin-invitation revocation from a non-root administrator", () => {
    renderPage(
      {
        items: [
          {
            invitationId,
            organizationId,
            kind: "staff",
            requestedRole: "admin",
            status: "pending",
            createdAt: "2029-01-01T00:00:00.000Z",
            expiresAt: "2030-01-01T00:00:00.000Z",
          },
        ],
      },
      "profile-1",
      false,
    );
    expect(screen.queryByRole("button", { name: "Revoke invitation" })).toBeNull();
  });
  it.each([
    "revoke",
    "refresh",
    "copy",
  ] as const)("fences late %s completion after StrictMode actor replacement", async (operation) => {
    let settle!: () => void;
    const delayed = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const pendingPage: InvitationPage = {
      ...page,
      items: [
        {
          invitationId,
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          status: "pending",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    };
    if (operation === "refresh")
      mocks.invalidate.mockReturnValue(
        delayed.then(() => {
          throw new Error("old refresh failed");
        }),
      );
    if (operation === "revoke")
      mocks.revoke.mockReturnValue(
        delayed.then(() => ({ status: "revoked", result: { invitationId, status: "revoked" } })),
      );
    if (operation === "copy") vi.mocked(navigator.clipboard.writeText).mockReturnValue(delayed);
    const view = renderPage(pendingPage);
    if (operation === "revoke") {
      fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
      const confirm = (await screen.findByRole("alertdialog")).querySelector(
        "button[data-variant='destructive']",
      );
      if (!confirm) throw new Error("Missing revoke confirmation");
      fireEvent.click(confirm);
      await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce());
    } else {
      await submit();
      await waitFor(() => expect(screen.getByLabelText("Invitation link")).toBeTruthy());
      if (operation === "copy")
        fireEvent.click(screen.getByRole("button", { name: "Copy invitation link" }));
    }
    view.rerender(
      <OrganizationInvitations
        actorProfileId="profile-2"
        canInviteAdministrators
        organizationId={organizationId}
        page={page}
      />,
    );
    await act(async () => {
      settle();
      await delayed;
    });
    expect(screen.queryByLabelText("Invitation link")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Invitation revoked|token copied|could not refresh/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Create invitation" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
  it("uses the canonical invitation id and status in revocation confirmation", async () => {
    renderPage({
      items: [
        {
          invitationId,
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          status: "pending",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
    await waitFor(() => expect(screen.getByText(new RegExp(invitationId))).toBeTruthy());
    const dialog = screen.getByRole("alertdialog");
    const confirm = dialog.querySelector("button[data-variant='destructive']");
    if (!confirm) throw new Error("Missing invitation revocation confirmation button");
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.revoke).toHaveBeenCalledWith({ data: { organizationId, invitationId } }),
    );
  });
  it("treats a stale pending invitation that became terminal as reconciliation-required", async () => {
    mocks.revoke.mockRejectedValue(new Error("already terminal"));
    renderPage({
      items: [
        {
          invitationId,
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          status: "pending",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
    const confirm = (await screen.findByRole("alertdialog")).querySelector(
      "button[data-variant='destructive']",
    );
    if (!confirm) throw new Error("Missing invitation revocation confirmation button");
    fireEvent.click(confirm);
    await waitFor(() => expect(document.body.textContent).toMatch(/could not confirm/i));
    expect(screen.queryByText("Invitation revoked.")).toBeNull();
  });
  it("locks after a committed revoke cannot refresh and never replays it", async () => {
    mocks.revoke.mockResolvedValue({
      status: "revoked",
      result: { invitationId, status: "revoked" },
    });
    mocks.invalidate.mockRejectedValue(new Error("refresh failed"));
    renderPage({
      items: [
        {
          invitationId,
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          status: "pending",
          createdAt: "2029-01-01T00:00:00.000Z",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
    const confirm = (await screen.findByRole("alertdialog")).querySelector(
      "button[data-variant='destructive']",
    );
    if (!confirm) throw new Error("Missing invitation revocation confirmation button");
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(screen.getByText(/revoked, but the list could not refresh/i)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh invitations" }));
    expect(mocks.revoke).toHaveBeenCalledOnce();
  });
  it("renders bounded cursor paging", () => {
    renderPage({ hasMore: true, nextCursor: "opaque-next" });
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toContain(
      "cursor=opaque-next",
    );
  });
});
