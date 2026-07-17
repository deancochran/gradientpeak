// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
}));

import { Route } from "./dashboard";

afterEach(cleanup);

describe("coach dashboard", () => {
  it("is the coaching index and does not imply access to athlete-owned data", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Coaching workspace" })).toBeTruthy();
    expect(screen.getByText("Profiles")).toBeTruthy();
    expect(screen.getByText("Weekly review")).toBeTruthy();
    expect(screen.getByText("Upcoming events")).toBeTruthy();
    expect(screen.getByText(/scoped athlete consent are implemented and verified/)).toBeTruthy();
  });
});
