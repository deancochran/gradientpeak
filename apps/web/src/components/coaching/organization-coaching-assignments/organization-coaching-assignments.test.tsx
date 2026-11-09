// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  candidates: vi.fn(),
  assign: vi.fn(),
  change: vi.fn(),
  end: vi.fn(),
  uuid: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../../../lib/coaching/organization-coaching-assignments-server-functions", () => ({
  loadOrganizationCoachingAssignments: mocks.load,
  loadOrganizationCoachingAssignmentCandidates: mocks.candidates,
  assignOrganizationCoach: mocks.assign,
  changeOrganizationCoach: mocks.change,
  endOrganizationCoachAssignment: mocks.end,
}));

import { OrganizationCoachingAssignments } from "./organization-coaching-assignments";

const organizationId = "11111111-1111-4111-8111-111111111111",
  engagementId = "22222222-2222-4222-8222-222222222222",
  coachId = "33333333-3333-4333-8333-333333333333",
  assignmentId = "44444444-4444-4444-8444-444444444444",
  operationId = "55555555-5555-4555-8555-555555555555",
  digest = "a".repeat(64);
function loaded() {
  return {
    status: "granted" as const,
    assignments: {
      stateDigest: digest,
      items: [
        {
          assignmentId,
          coachMembershipId: coachId,
          assignmentKind: "primary" as const,
          assignedAt: new Date(),
        },
      ],
    },
    candidates: {
      items: [{ membershipId: coachId, label: "Casey Coach" }],
      nextCursor: null,
      hasMore: false,
    },
  };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("uninitialized");
  };
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
describe("OrganizationCoachingAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: mocks.uuid });
    mocks.uuid.mockReturnValue(operationId);
    mocks.load.mockResolvedValue(loaded());
    mocks.end.mockResolvedValue({ status: "ended", engagementId, operationId });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it("shows current direct responsibility and consent independence without a private-workspace shortcut", async () => {
    render(
      <OrganizationCoachingAssignments
        athleteName="Alex Athlete"
        engagementId={engagementId}
        actorProfileId="profile-1"
        onAccessLost={vi.fn()}
        onClose={vi.fn()}
        organizationId={organizationId}
      />,
    );
    expect(
      (await screen.findByRole("list", { name: "Current coaching responsibilities" })).textContent,
    ).toContain("primary — Casey Coach");
    expect(screen.getByText(/separate from athlete consent/)).toBeTruthy();
    expect(screen.queryByText(/private workspace/i)).toBeNull();
  });
  it("requires explicit confirmation and sends the list state digest", async () => {
    render(
      <OrganizationCoachingAssignments
        athleteName="Alex Athlete"
        engagementId={engagementId}
        actorProfileId="profile-1"
        onAccessLost={vi.fn()}
        onClose={vi.fn()}
        organizationId={organizationId}
      />,
    );
    await screen.findByRole("list", { name: "Current coaching responsibilities" });
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm responsibility change" }));
    await waitFor(() =>
      expect(mocks.end).toHaveBeenCalledWith({
        data: {
          organizationId,
          engagementId,
          assignmentId,
          operationId,
          expectedStateDigest: digest,
        },
      }),
    );
  });
  it("refreshes after a stale-state conflict and requires a new intent", async () => {
    mocks.end.mockRejectedValue(Object.assign(new Error("stale"), { code: "CONFLICT" }));
    render(
      <OrganizationCoachingAssignments
        athleteName="Alex Athlete"
        engagementId={engagementId}
        actorProfileId="profile-1"
        onAccessLost={vi.fn()}
        onClose={vi.fn()}
        organizationId={organizationId}
      />,
    );
    await screen.findByRole("list", { name: "Current coaching responsibilities" });
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm responsibility change" }));
    expect(await screen.findByText(/Responsibilities changed elsewhere/)).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Confirm responsibility change" })).toBeNull();
  });
  it("retains the exact request when a result is unknown", async () => {
    const onClose = vi.fn();
    const reconciliation = deferred<ReturnType<typeof loaded>>();
    mocks.load.mockResolvedValueOnce(loaded()).mockReturnValueOnce(reconciliation.promise);
    mocks.end.mockRejectedValue(new Error("network"));
    render(
      <OrganizationCoachingAssignments
        athleteName="Alex Athlete"
        engagementId={engagementId}
        actorProfileId="profile-1"
        onAccessLost={vi.fn()}
        onClose={onClose}
        organizationId={organizationId}
      />,
    );
    await screen.findByRole("list", { name: "Current coaching responsibilities" });
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm responsibility change" }));
    expect(await screen.findByRole("button", { name: "Retry exact request" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh current assignments" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    const retry = screen.getByRole("button", { name: "Retry exact request" });
    const refresh = screen.getByRole("button", { name: "Refresh current assignments" });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
    const back = screen.getByRole("button", { name: "Back to athlete roster" });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(back);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(retry);
    fireEvent.click(refresh);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    reconciliation.resolve(loaded());
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    expect((back as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Retry exact request" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry exact request" }));
    await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(2));
    expect(mocks.end.mock.calls[0]).toEqual(mocks.end.mock.calls[1]);
  });
  it("propagates revoked assignment authority to the roster owner", async () => {
    const onAccessLost = vi.fn();
    mocks.load.mockResolvedValueOnce({ status: "forbidden" });
    render(
      <OrganizationCoachingAssignments
        actorProfileId="profile-1"
        athleteName="Alex Athlete"
        engagementId={engagementId}
        onAccessLost={onAccessLost}
        onClose={vi.fn()}
        organizationId={organizationId}
      />,
    );
    await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert").textContent).toMatch(/access changed/);
  });
  it("single-flights a deferred candidate page and ignores it after actor scope replacement", async () => {
    const pending = deferred<{
      status: "granted";
      page: { items: { membershipId: string; label: string }[]; nextCursor: null; hasMore: false };
    }>();
    mocks.load.mockResolvedValue({
      ...loaded(),
      candidates: {
        ...loaded().candidates,
        nextCursor: "66666666-6666-4666-8666-666666666666",
        hasMore: true,
      },
    });
    mocks.candidates.mockReturnValue(pending.promise);
    const view = render(
      <OrganizationCoachingAssignments
        actorProfileId="profile-1"
        athleteName="Alex Athlete"
        engagementId={engagementId}
        onAccessLost={vi.fn()}
        onClose={vi.fn()}
        organizationId={organizationId}
      />,
    );
    await screen.findByRole("button", { name: "Load more eligible coaches" });
    fireEvent.click(screen.getByRole("button", { name: "Load more eligible coaches" }));
    fireEvent.click(screen.getByRole("button", { name: "Loading eligible coaches…" }));
    expect(mocks.candidates).toHaveBeenCalledTimes(1);
    view.rerender(
      <OrganizationCoachingAssignments
        actorProfileId="profile-2"
        athleteName="Blair Athlete"
        engagementId={engagementId}
        onAccessLost={vi.fn()}
        onClose={vi.fn()}
        organizationId={organizationId}
      />,
    );
    pending.resolve({
      status: "granted",
      page: {
        items: [{ membershipId: "77777777-7777-4777-8777-777777777777", label: "Stale Coach" }],
        nextCursor: null,
        hasMore: false,
      },
    });
    await waitFor(() => expect(screen.queryByText("Stale Coach")).toBeNull());
  });
});
