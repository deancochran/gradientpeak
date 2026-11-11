// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

import { OrganizationAuditHistory } from "./organization-audit-history";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrganizationAuditHistory", () => {
  it("renders safe event metadata, marks arbitrary details as hidden, and does not offer export", () => {
    render(
      <OrganizationAuditHistory
        organizationId="11111111-1111-4111-8111-111111111111"
        filters={{}}
        page={{
          hasMore: false,
          nextCursor: null,
          items: [
            {
              eventId: "22222222-2222-4222-8222-222222222222",
              occurredAt: new Date("2026-11-08T12:00:00.000Z"),
              actor: {
                profileId: "33333333-3333-4333-8333-333333333333",
                displayName: "Maya Chen",
                username: "maya",
              },
              action: "assignment.changed",
              resource: { type: "coaching_assignment", id: "44444444-4444-4444-8444-444444444444" },
              details: "redacted",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Maya Chen")).toBeTruthy();
    expect(screen.getByText("Details hidden")).toBeTruthy();
    expect(screen.getByText(/Export is unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View event" }));
    expect(screen.getByText(/Sensitive event details are restricted/)).toBeTruthy();
    expect(screen.getByText(/does not include a discrete outcome field/)).toBeTruthy();
  });

  it("uses typed filters and clears the cursor on a new query", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    render(
      <OrganizationAuditHistory
        organizationId={organizationId}
        filters={{}}
        page={{ hasMore: false, nextCursor: null, items: [] }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: " organization.closed " },
    });
    fireEvent.change(screen.getByLabelText("From (UTC)"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/organizations/$organizationId/audit",
      params: { organizationId },
      search: {
        action: "organization.closed",
        actorProfileId: undefined,
        resourceType: undefined,
        resourceId: undefined,
        fromInclusive: "2026-11-01T00:00:00.000Z",
        toExclusive: undefined,
        cursor: undefined,
      },
    });
  });
});
