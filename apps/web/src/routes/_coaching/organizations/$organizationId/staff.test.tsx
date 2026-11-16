// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: {
    status: "granted" as const,
    page: { items: [], nextCursor: null, hasMore: false },
  } as unknown,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.result,
    useSearch: () => ({}),
    useParams: () => ({ organizationId: "11111111-1111-4111-8111-111111111111" }),
  }),
  Link: ({ children }: { children: ReactNode }) => <a href="/staff">{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("../../../../lib/coaching/staff-server-functions", () => ({
  loadOrganizationStaff: vi.fn(),
}));

import { Route } from "./staff";

afterEach(() => {
  cleanup();
  state.result = { status: "granted", page: { items: [], nextCursor: null, hasMore: false } };
});

describe("staff route", () => {
  it("renders the current route organization roster", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByText("No active staff on this page.")).toBeTruthy();
  });

  it("renders access lost instead of stale tenant data", () => {
    state.result = { status: "forbidden" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Coaching access required" })).toBeTruthy();
  });

  it("returns an invalidated cursor page to the first page without retrying the same cursor", () => {
    const ErrorComponent = (Route as unknown as { errorComponent: ComponentType }).errorComponent;
    render(<ErrorComponent />);
    expect(screen.getByRole("link", { name: "Return to first page" })).toBeTruthy();
  });
});
