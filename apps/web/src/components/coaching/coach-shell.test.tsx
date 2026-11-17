// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({
  pathname: "/organizations/11111111-1111-4111-8111-111111111111/dashboard",
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    "aria-current": current,
  }: {
    children: ReactNode;
    to: string;
    "aria-current"?: "page";
  }) => (
    <a href={to} aria-current={current}>
      {children}
    </a>
  ),
  Outlet: () => <div>Coaching route content</div>,
  useLocation: () => location,
}));

import { CoachShell } from "./coach-shell";

afterEach(() => {
  cleanup();
  location.pathname = "/organizations/11111111-1111-4111-8111-111111111111/dashboard";
});

describe("CoachShell", () => {
  it("marks assignment facts rather than Dashboard current in mobile navigation", () => {
    location.pathname = "/organizations/11111111-1111-4111-8111-111111111111/coaching";
    render(
      <CoachShell
        organization={{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Summit Coaching",
          slug: "summit-coaching",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open coaching navigation" }));
    const navigation = within(
      screen.getByRole("navigation", { name: "Mobile coaching navigation" }),
    );
    expect(
      navigation.getByRole("link", { name: "Assignment facts" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      navigation.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current"),
    ).toBeNull();
  });
  it("uses coaching-specific identity and navigation instead of the standard profile shell", () => {
    render(
      <CoachShell
        organization={{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Summit Coaching",
          slug: "summit-coaching",
        }}
      />,
    );

    expect(screen.getByText("GradientPeak Coaching")).toBeTruthy();
    expect(screen.getByText("Summit Coaching")).toBeTruthy();
    expect(screen.getByText("GradientPeak Coaching").closest("a")?.getAttribute("href")).toBe(
      "/organizations/$organizationId/coaching",
    );
    expect(screen.getByText("Coach workspace")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Coaching navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Athletes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Assignments" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Assignment facts" }).getAttribute("href")).toBe(
      "/organizations/$organizationId/coaching",
    );
    expect(screen.getByRole("link", { name: "Organizations" })).toBeTruthy();
    expect(screen.getByText("Coaching route content")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Personal workspace" })).toBeTruthy();
    expect(screen.queryByText("Record")).toBeNull();
    expect(screen.queryByText("Activities")).toBeNull();
  });
});
