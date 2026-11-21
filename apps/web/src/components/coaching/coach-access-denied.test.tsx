// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { CoachAccessDenied } from "./coach-access-denied";

afterEach(cleanup);

describe("CoachAccessDenied", () => {
  it("uses neutral authorization wording and provides selector and Personal workspace escapes", () => {
    render(<CoachAccessDenied />);

    expect(screen.getByText(/not available for this coaching session/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Organization access unavailable" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Choose an organization" }).getAttribute("href")).toBe(
      "/organizations",
    );
    expect(
      screen.getByRole("link", { name: "Return to Personal workspace" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByText(/membership|role/i)).toBeNull();
  });
});
