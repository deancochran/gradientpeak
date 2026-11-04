// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), endMembership: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/staff">{children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../../../lib/coaching/staff-server-functions", () => ({
  endOrganizationStaffMembership: mocks.endMembership,
}));

import { StaffRoster } from "./staff-roster";

const organizationId = "11111111-1111-4111-8111-111111111111";
const page = {
  items: [
    {
      membershipId: "22222222-2222-4222-8222-222222222222",
      identity: { profileId: "profile-2", displayName: "Casey Coach", username: "casey" },
      roleKeys: ["admin", "coach"] as Array<"admin" | "coach">,
      endMembership: { eligible: true, reason: null },
    },
  ],
  nextCursor: "33333333-3333-4333-8333-333333333333",
  hasMore: true,
};
const secondEligible = {
  membershipId: "66666666-6666-4666-8666-666666666666",
  identity: { profileId: "profile-6", displayName: "Riley Coach", username: "riley" },
  roleKeys: ["coach"] as Array<"admin" | "coach">,
  endMembership: { eligible: true, reason: null },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StaffRoster", () => {
  it("renders only the administrative staff roster, page control, and root-owner protection notice", () => {
    render(<StaffRoster organizationId={organizationId} page={page} />);
    expect(screen.getByRole("heading", { name: "Staff roster" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Staff roster", hidden: true }).textContent).toContain(
      "Casey Coach",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toBeTruthy();
    expect(screen.getByText(/root-owner membership cannot be ended/i)).toBeTruthy();
    expect(screen.getByText(/does not provide access to private athlete records/i)).toBeTruthy();
  });

  it("renders only the server-computed membership-ending affordance", () => {
    render(<StaffRoster organizationId={organizationId} page={page} />);
    expect(screen.getByRole("button", { name: "End membership for Casey Coach" })).toBeTruthy();
  });

  it("replaces the displayed tenant roster when the current organization changes", () => {
    const { rerender } = render(<StaffRoster organizationId={organizationId} page={page} />);
    rerender(
      <StaffRoster
        organizationId="44444444-4444-4444-8444-444444444444"
        page={{
          items: [
            {
              membershipId: "55555555-5555-4555-8555-555555555555",
              identity: {
                profileId: "profile-5",
                displayName: "Morgan Manager",
                username: "morgan",
              },
              roleKeys: ["coach"],
              endMembership: { eligible: false, reason: "self" },
            },
          ],
          nextCursor: null,
          hasMore: false,
        }}
      />,
    );
    expect(screen.getByText("Morgan Manager")).toBeTruthy();
    expect(screen.queryByText("Casey Coach")).toBeNull();
  });

  it("does not submit an old selected membership against a newly rendered organization", async () => {
    let resolveRequest: (() => void) | undefined;
    mocks.endMembership.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve({ status: "ended" });
        }),
    );
    const { rerender } = render(<StaffRoster organizationId={organizationId} page={page} />);
    fireEvent.click(screen.getByRole("button", { name: "End membership for Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "End membership" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ending membership…" })).toBeTruthy(),
    );
    rerender(
      <StaffRoster
        organizationId="44444444-4444-4444-8444-444444444444"
        page={{ items: [], nextCursor: null, hasMore: false }}
      />,
    );
    resolveRequest?.();
    await Promise.resolve();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.endMembership.mock.calls[0]?.[0].data.organizationId).toBe(organizationId);
  });

  it("locks further changes after a committed refresh failure until recovery succeeds", async () => {
    mocks.endMembership.mockResolvedValue({ status: "ended" });
    mocks.invalidate
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce(undefined);
    render(<StaffRoster organizationId={organizationId} page={page} />);
    fireEvent.click(screen.getByRole("button", { name: "End membership for Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "End membership" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh roster" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "End membership for Casey Coach" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh roster" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Refresh roster" })).toBeNull(),
    );
  });

  it("survives StrictMode remount for a successful command", async () => {
    mocks.endMembership.mockResolvedValue({ status: "ended" });
    mocks.invalidate.mockResolvedValue(undefined);
    render(
      <StrictMode>
        <StaffRoster organizationId={organizationId} page={page} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "End membership for Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "End membership" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("Casey Coach's membership ended.");
  });

  it("survives StrictMode remount for an access-lost command", async () => {
    mocks.endMembership.mockResolvedValue({ status: "access_lost" });
    render(
      <StrictMode>
        <StaffRoster organizationId={organizationId} page={page} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "End membership for Casey Coach" }));
    fireEvent.click(screen.getByRole("button", { name: "End membership" }));
    await waitFor(() => expect(screen.getByText(/access has changed/i)).toBeTruthy());
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("singleflights duplicate submit and blocks row switching while pending", async () => {
    mocks.endMembership.mockImplementation(() => new Promise(() => {}));
    render(
      <StaffRoster
        organizationId={organizationId}
        page={{ ...page, items: [...page.items, secondEligible] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End membership for Casey Coach" }));
    const submit = screen.getByRole("button", { name: "End membership" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.endMembership).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "End membership for Riley Coach", hidden: true }),
    ).toHaveProperty("disabled", true);
  });

  it("renders distinct empty and stale-page states", () => {
    const { rerender } = render(
      <StaffRoster
        organizationId={organizationId}
        page={{ items: [], nextCursor: null, hasMore: false }}
      />,
    );
    expect(screen.getByRole("heading", { name: "No active staff members" })).toBeTruthy();
    rerender(
      <StaffRoster
        organizationId={organizationId}
        cursor="33333333-3333-4333-8333-333333333333"
        page={{ items: [], nextCursor: null, hasMore: false }}
      />,
    );
    expect(screen.getByRole("heading", { name: "No staff on this page" })).toBeTruthy();
  });
});
