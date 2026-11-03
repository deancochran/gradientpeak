// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  overview: {
    status: "granted" as const,
    canReadAdministrativeRoster: true,
    staff: {
      items: [
        {
          membershipId: "11111111-1111-4111-8111-111111111111",
          identity: { profileId: "profile-1", displayName: "Casey Coach", username: "casey" },
          roleKeys: ["admin", "coach"] as Array<"admin" | "coach">,
        },
      ],
    },
    athletes: {
      items: [
        {
          engagementId: "22222222-2222-4222-8222-222222222222",
          identity: { profileId: "profile-2", displayName: "Alex Athlete", username: "alex" },
          status: "active" as const,
        },
      ],
    },
  } as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.overview,
    useParams: () => ({ organizationId: "organization-1" }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { Route } from "./dashboard";

afterEach(() => {
  cleanup();
  state.overview = {
    status: "granted",
    canReadAdministrativeRoster: true,
    staff: { items: [] },
    athletes: { items: [] },
  };
});

describe("coach dashboard", () => {
  it("shows administrative records without implying private athlete data access", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Organization management" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Staff" }).textContent).toContain("Casey Coach");
    expect(screen.getByRole("list", { name: "Athletes" }).textContent).toContain("Alex Athlete");
    expect(screen.getByText(/does not grant access to private athlete training/)).toBeTruthy();
  });

  it("renders an explicit access-lost state instead of organization data", () => {
    state.overview = { status: "forbidden" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Coaching access required" })).toBeTruthy();
    expect(screen.queryByText("Casey Coach")).toBeNull();
  });
});
