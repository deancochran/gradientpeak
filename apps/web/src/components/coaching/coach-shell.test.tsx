// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  Outlet: () => <div>Coaching route content</div>,
  useLocation: () => ({
    pathname: "/organizations/11111111-1111-4111-8111-111111111111/dashboard",
  }),
}));

import { CoachShell } from "./coach-shell";

afterEach(cleanup);

describe("CoachShell", () => {
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
    expect(screen.getByText("Coach workspace")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Coaching navigation" })).toBeTruthy();
    expect(screen.getByText("Coaching route content")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Standard app" })).toBeTruthy();
    expect(screen.queryByText("Record")).toBeNull();
    expect(screen.queryByText("Activities")).toBeNull();
  });
});
