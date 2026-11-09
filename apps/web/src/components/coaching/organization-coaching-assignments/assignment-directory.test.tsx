// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("./organization-coaching-assignments", () => ({
  OrganizationCoachingAssignments: ({
    athleteName,
    onClose,
  }: {
    athleteName: string;
    onClose: () => void;
  }) => (
    <div>
      Manage coaching responsibility for {athleteName}
      <button type="button" onClick={onClose}>
        Close editor
      </button>
    </div>
  ),
}));

import { AssignmentDirectory } from "./assignment-directory";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const page = {
  items: [
    {
      engagementId: "22222222-2222-4222-8222-222222222222",
      identity: { displayName: "Alex Athlete", username: "alex" },
      status: "active" as const,
      assignments: [
        {
          assignmentId: "33333333-3333-4333-8333-333333333333",
          assignmentKind: "primary" as const,
          coachName: "Casey Coach",
          coachMembershipStatus: "active" as const,
        },
        {
          assignmentId: "44444444-4444-4444-8444-444444444444",
          assignmentKind: "supporting" as const,
          coachName: "Morgan Coach",
          coachMembershipStatus: "suspended" as const,
        },
      ],
    },
    {
      engagementId: "55555555-5555-4555-8555-555555555555",
      identity: { displayName: "Jordan Athlete", username: null },
      status: "active" as const,
      assignments: [],
    },
  ],
  nextCursor: null,
  hasMore: false,
};

describe("AssignmentDirectory", () => {
  it("hides stale directory entries through editing and failed refresh, with safe retry", async () => {
    mocks.invalidate.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(
      <AssignmentDirectory
        actorProfileId="profile"
        organizationId={organizationId}
        page={page}
        search={null}
      />,
    );
    const manage = screen.getAllByRole("button", { name: "Manage coaches" })[0];
    if (!manage) throw new Error("Missing management control");
    fireEvent.click(manage);
    expect(screen.queryByText("Casey Coach")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry assignment refresh" })).toBeTruthy(),
    );
    expect(screen.queryByText("Casey Coach")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry assignment refresh" }));
    await waitFor(() => expect(screen.getByText("Casey Coach")).toBeTruthy());
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true });
  });
  it("shows primary, supporting, and genuinely unassigned direct responsibility without timed-cover claims", () => {
    render(
      <AssignmentDirectory
        actorProfileId="profile"
        organizationId={organizationId}
        page={page}
        search={null}
      />,
    );
    expect(screen.getByText("Casey Coach")).toBeTruthy();
    expect(screen.getByText("Morgan Coach")).toBeTruthy();
    expect(screen.getByText("Coach suspended")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getAllByText("Coverage unavailable")).toHaveLength(2);
    expect(
      screen.getByText(/Temporary coverage and handovers are unavailable in this directory/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply filters" }).className).toContain(
      "bg-cyan-400",
    );
    const findAthlete = screen.getAllByRole("button", { name: "Find an athlete to assign" })[0];
    if (!findAthlete) throw new Error("Missing assignment workflow entry point");
    fireEvent.click(findAthlete);
    expect(document.activeElement).toBe(screen.getByLabelText("Search athletes on this page"));
    expect(screen.getAllByRole("button", { name: "Manage coaches" })[0]?.className).toContain(
      "bg-slate-900",
    );
  });

  it("keeps page-local search explicit, applies real route filters, and opens responsibility controls", () => {
    render(
      <AssignmentDirectory
        actorProfileId="profile"
        organizationId={organizationId}
        page={page}
        search={null}
      />,
    );
    fireEvent.change(screen.getByLabelText("Search athletes on this page"), {
      target: { value: "Jordan" },
    });
    fireEvent.change(screen.getByLabelText("Primary coach filter"), {
      target: { value: "unassigned" },
    });
    fireEvent.change(screen.getByLabelText("Athlete status filter"), {
      target: { value: "paused" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/organizations/$organizationId/assignments",
      params: { organizationId },
      search: { q: "Jordan", cursor: undefined, primary: "unassigned", status: "paused" },
    });
    expect(screen.queryByText("Casey Coach")).toBeTruthy();
    const manageButton = screen.getAllByRole("button", { name: "Manage coaches" })[0];
    if (!manageButton) throw new Error("Expected an athlete responsibility control");
    fireEvent.click(manageButton);
    expect(screen.getByText("Manage coaching responsibility for Alex Athlete")).toBeTruthy();
  });
});
