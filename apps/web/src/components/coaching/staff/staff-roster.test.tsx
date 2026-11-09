// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
  offboardingImpact: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/staff" className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../../../lib/coaching/staff-server-functions", () => ({
  suspendOrganizationStaffMembership: mocks.suspend,
  resumeOrganizationStaffMembership: mocks.resume,
  grantOrganizationStaffRole: mocks.grant,
  revokeOrganizationStaffRole: mocks.revoke,
  loadOrganizationStaffOffboardingImpact: mocks.offboardingImpact,
}));

import { StaffRoster } from "./staff-roster";

const organizationId = "11111111-1111-4111-8111-111111111111";
const member = {
  membershipId: "22222222-2222-4222-8222-222222222222",
  identity: { profileId: "profile-2", displayName: "Casey Coach", username: "casey" },
  roleKeys: ["admin", "coach"] as Array<"admin" | "coach">,
  status: "active" as const,
  suspendedAt: null,
  endMembership: { eligible: true, reason: null },
  actions: {
    suspend: { eligible: true },
    resume: { eligible: true },
    grantAdmin: { eligible: true },
    revokeAdmin: { eligible: true },
    grantCoach: { eligible: true },
    revokeCoach: { eligible: true },
  },
};
const page = { items: [member], nextCursor: null, hasMore: false };
const renderRoster = (props: Partial<React.ComponentProps<typeof StaffRoster>> = {}) =>
  render(<StaffRoster organizationId={organizationId} page={page} status="active" {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.offboardingImpact.mockResolvedValue({
    status: "granted",
    impact: {
      target: {
        membershipId: member.membershipId,
        identity: member.identity,
        offboarding: { eligible: true, reason: null },
      },
      assignedAthleteCount: 1,
      assignedAthletes: [
        {
          engagementId: "55555555-5555-4555-8555-555555555555",
          profileId: "profile-athlete",
          displayName: "Avery Athlete",
          username: "avery",
          assignmentKinds: ["primary"],
        },
      ],
      nextCursor: null,
      hasMore: false,
      resourceInventory: { status: "unavailable" },
    },
  });
});
afterEach(cleanup);

describe("StaffRoster suspension", () => {
  it("loads a read-only impact preview without offering a terminal membership mutation", async () => {
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Review offboarding impact" }));
    expect(screen.getByRole("status").textContent).toMatch(/loading offboarding impact/i);
    await waitFor(() =>
      expect(screen.getByRole("alertdialog").textContent).toContain(
        "Casey Coach has 1 assigned athlete",
      ),
    );
    expect(screen.getByText(/Avery Athlete — primary/)).toBeTruthy();
    expect(screen.getByText(/resources are unavailable and have not been assessed/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /end membership|confirm offboarding/i }),
    ).toBeNull();
    expect(mocks.offboardingImpact).toHaveBeenCalledWith({
      data: { organizationId, membershipId: member.membershipId, limit: 20, cursor: null },
    });
  });

  it("keeps roster entry controls readable against the dark staff surface", () => {
    renderRoster();
    expect(screen.getByRole("button", { name: "Review offboarding impact" }).className).toContain(
      "bg-slate-950",
    );
    expect(screen.getByRole("button", { name: "Revoke admin" }).className).toContain(
      "border-slate-600",
    );
    expect(screen.getByRole("link", { name: "Suspended" }).className).toContain("bg-slate-950");
    expect(screen.getByRole("link", { name: "Active" }).className).toContain("bg-cyan-500");
  });

  it("shows protected offboarding reasoning and suppresses stale impact results after scope changes", async () => {
    let resolveImpact: ((value: unknown) => void) | undefined;
    mocks.offboardingImpact.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImpact = resolve;
        }),
    );
    const view = renderRoster({
      page: {
        ...page,
        items: [
          {
            ...member,
            endMembership: { eligible: false, reason: "root_owner" },
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review offboarding impact" }));
    view.rerender(
      <StaffRoster
        organizationId="44444444-4444-4444-8444-444444444444"
        page={{ items: [], nextCursor: null, hasMore: false }}
        status="active"
      />,
    );
    resolveImpact?.({
      status: "granted",
      impact: {
        target: {
          membershipId: member.membershipId,
          identity: member.identity,
          offboarding: { eligible: false, reason: "root_owner" },
        },
        assignedAthleteCount: 1,
        assignedAthletes: [],
        nextCursor: null,
        hasMore: false,
        resourceInventory: { status: "unavailable" },
      },
    });
    await Promise.resolve();
    expect(screen.queryByText(/root-owner membership cannot/i)).toBeNull();
  });

  it("offers a generic retry after an impact-preview failure", async () => {
    mocks.offboardingImpact.mockRejectedValueOnce(new Error("network"));
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Review offboarding impact" }));
    await waitFor(() =>
      expect(screen.getByText(/could not load the offboarding impact/i)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.offboardingImpact).toHaveBeenCalledTimes(2));
  });

  it("explains a protected root-owner membership without offering an offboarding command", async () => {
    mocks.offboardingImpact.mockResolvedValueOnce({
      status: "granted",
      impact: {
        target: {
          membershipId: member.membershipId,
          identity: member.identity,
          offboarding: { eligible: false, reason: "root_owner" },
        },
        assignedAthleteCount: 0,
        assignedAthletes: [],
        nextCursor: null,
        hasMore: false,
        resourceInventory: { status: "unavailable" },
      },
    });
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Review offboarding impact" }));
    await waitFor(() =>
      expect(screen.getByText("The root-owner membership cannot be offboarded.")).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: /end membership|confirm offboarding/i }),
    ).toBeNull();
  });

  it("submits an explicit reason and refreshes after a successful suspension", async () => {
    mocks.suspend.mockImplementation(
      async ({ data }: { data: { membershipId: string; operationId: string } }) => ({
        ...data,
        status: "suspended",
      }),
    );
    mocks.invalidate.mockResolvedValue(undefined);
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    expect(screen.getByLabelText("Reason")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() => expect(mocks.suspend).toHaveBeenCalledOnce());
    expect(mocks.suspend.mock.calls[0]?.[0].data).toMatchObject({
      organizationId,
      membershipId: member.membershipId,
      reason: "administrative_review",
    });
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("was suspended");
  });

  it("does not issue a command for protected self/root memberships", () => {
    renderRoster({
      page: {
        ...page,
        items: [
          {
            ...member,
            endMembership: { eligible: false, reason: "self" },
            actions: { ...member.actions, suspend: { eligible: false } },
          },
        ],
      },
    });
    expect(screen.queryByRole("button", { name: "Suspend Casey Coach" })).toBeNull();
    expect(screen.getByRole("button", { name: "Revoke coach" })).not.toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByText("Your current authority does not allow this membership status change."),
    ).toBeTruthy();
  });

  it("forwards a role grant with a fresh operation id and rereads the authoritative roster", async () => {
    mocks.grant.mockImplementation(
      async ({ data }: { data: { membershipId: string; role: "coach"; operationId: string } }) => ({
        membershipId: data.membershipId,
        role: data.role,
        operationId: data.operationId,
        status: "granted",
      }),
    );
    mocks.invalidate.mockResolvedValue(undefined);
    renderRoster({ page: { ...page, items: [{ ...member, roleKeys: ["admin"] }] } });
    fireEvent.click(screen.getByRole("button", { name: "Grant coach" }));
    fireEvent.click(screen.getByRole("button", { name: /^Grant coach$/ }));
    await waitFor(() => expect(mocks.grant).toHaveBeenCalledOnce());
    expect(mocks.grant.mock.calls[0]?.[0].data).toMatchObject({
      organizationId,
      membershipId: member.membershipId,
      role: "coach",
    });
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("retries an unknown role result with the identical operation and locks inverse commands", async () => {
    mocks.grant
      .mockRejectedValueOnce(new Error("timeout"))
      .mockImplementation(
        async ({
          data,
        }: {
          data: { membershipId: string; role: "coach"; operationId: string };
        }) => ({
          membershipId: data.membershipId,
          role: data.role,
          operationId: data.operationId,
          status: "granted",
        }),
      );
    renderRoster({ page: { ...page, items: [{ ...member, roleKeys: ["admin"] }] } });
    fireEvent.click(screen.getByRole("button", { name: "Grant coach" }));
    fireEvent.click(screen.getByRole("button", { name: /^Grant coach$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry same Grant coach" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Revoke admin", hidden: true })).toHaveProperty(
      "disabled",
      true,
    );
    const first = mocks.grant.mock.calls[0]?.[0].data;
    fireEvent.click(screen.getByRole("button", { name: "Retry same Grant coach" }));
    await waitFor(() => expect(mocks.grant).toHaveBeenCalledTimes(2));
    expect(mocks.grant.mock.calls[1]?.[0].data).toEqual(first);
  });

  it("locks without overlaying the row when a role receipt has another operation id", async () => {
    mocks.grant.mockResolvedValue({
      membershipId: member.membershipId,
      role: "coach",
      operationId: "33333333-3333-4333-8333-333333333333",
      status: "granted",
    });
    renderRoster({ page: { ...page, items: [{ ...member, roleKeys: ["admin"] }] } });
    fireEvent.click(screen.getByRole("button", { name: "Grant coach" }));
    fireEvent.click(screen.getByRole("button", { name: /^Grant coach$/ }));
    await waitFor(() => expect(screen.getByText(/could not be reconciled/i)).toBeTruthy());
    expect(screen.getByText("admin")).toBeTruthy();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("retains the exact operation payload and allows only that retry after an unknown result", async () => {
    mocks.suspend
      .mockRejectedValueOnce(new Error("timeout"))
      .mockImplementation(
        async ({ data }: { data: { membershipId: string; operationId: string } }) => ({
          ...data,
          status: "suspended",
        }),
      );
    mocks.invalidate.mockResolvedValue(undefined);
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry same Suspend membership" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Refresh roster", hidden: true })).toBeTruthy();
    const first = mocks.suspend.mock.calls[0]?.[0].data;
    fireEvent.click(screen.getByRole("button", { name: "Retry same Suspend membership" }));
    await waitFor(() => expect(mocks.suspend).toHaveBeenCalledTimes(2));
    expect(mocks.suspend.mock.calls[1]?.[0].data).toEqual(first);
  });

  it("does not let a stale scope response invalidate a replacement organization", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    mocks.suspend.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const view = renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    view.rerender(
      <StaffRoster
        organizationId="44444444-4444-4444-8444-444444444444"
        page={{ items: [], nextCursor: null, hasMore: false }}
        status="active"
      />,
    );
    resolveRequest?.({
      membershipId: member.membershipId,
      operationId: mocks.suspend.mock.calls[0]?.[0].data.operationId,
      status: "suspended",
    });
    await Promise.resolve();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("fences staff identities and commands when mutation authority is lost", async () => {
    mocks.suspend.mockResolvedValue({ status: "access_lost" });
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() =>
      expect(screen.getByText(/staff-management access has changed/i)).toBeTruthy(),
    );
    expect(screen.queryByText("Casey Coach")).toBeNull();
    expect(screen.queryByRole("button", { name: /Suspend|Grant|Revoke/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Reauthorize roster" })).toBeTruthy();
  });

  it("restores the roster only after a fresh granted page snapshot follows reauthorization", async () => {
    mocks.suspend.mockResolvedValue({ status: "access_lost" });
    mocks.invalidate.mockResolvedValue(undefined);
    const view = renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reauthorize roster" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reauthorize roster" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(screen.queryByText("Casey Coach")).toBeNull();
    view.rerender(
      <StaffRoster
        organizationId={organizationId}
        page={{ ...page, items: [...page.items] }}
        status="active"
      />,
    );
    await waitFor(() => expect(screen.getByText("Casey Coach")).toBeTruthy());
  });

  it("does not revive a denied command dialog or retry payload after a fresh authorized page", async () => {
    mocks.suspend.mockResolvedValue({ status: "access_lost" });
    const view = renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reauthorize roster" })).toBeTruthy(),
    );
    view.rerender(
      <StaffRoster
        organizationId={organizationId}
        page={{
          ...page,
          items: [{ ...member, actions: { ...member.actions, suspend: { eligible: false } } }],
        }}
        status="active"
      />,
    );
    await waitFor(() => expect(screen.getByText("Casey Coach")).toBeTruthy());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /Retry same|Suspend membership/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suspend Casey Coach" })).toBeNull();
  });

  it("locks new commands when post-commit refresh fails", async () => {
    mocks.suspend.mockImplementation(
      async ({ data }: { data: { membershipId: string; operationId: string } }) => ({
        ...data,
        status: "suspended",
      }),
    );
    mocks.invalidate.mockRejectedValueOnce(new Error("refresh failed"));
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh roster" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Suspend Casey Coach" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("does not overlay a mismatched historical receipt over the current active row", async () => {
    mocks.suspend.mockResolvedValue({
      membershipId: member.membershipId,
      operationId: "33333333-3333-4333-8333-333333333333",
      status: "suspended",
    });
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Suspend Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend membership" }));
    await waitFor(() => expect(screen.getByText(/could not be reconciled/i)).toBeTruthy());
    expect(screen.getByText("active")).toBeTruthy();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
