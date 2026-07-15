// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./search";

const mocks = vi.hoisted(() => ({
  routeSearch: { q: "coach" as string | undefined },
  searchUsers: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useSearch: () => mocks.routeSearch,
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../lib/api/client", () => ({
  api: { social: { searchUsers: { useQuery: () => mocks.searchUsers() } } },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.routeSearch.q = "coach";
});

describe("protected search GET form", () => {
  it("keeps the URL canonical while clear only edits the controlled native GET field", () => {
    mocks.searchUsers.mockReturnValue({ data: { users: [] }, isFetching: true, isLoading: false });
    const SearchPage = (Route as unknown as { component: React.ComponentType }).component;
    const { rerender } = render(<SearchPage />);

    const input = screen.getByRole("searchbox", { name: "Search profiles and web sections" });
    const form = input.closest("form");
    if (!form) throw new Error("Expected global search GET form");
    expect(input.getAttribute("name")).toBe("q");
    expect(screen.getByRole("status", { name: "Searching profiles" })).toBeTruthy();
    expect(screen.getByText('Results for "coach"')).toBeTruthy();

    fireEvent.click(screen.getByTestId("global-search-clear"));
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText('Results for "coach"')).toBeTruthy();
    expect(new FormData(form).get("q")).toBe("");

    const submitSpy = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitSpy);
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
    fireEvent.submit(form);
    expect(submitSpy).toHaveBeenCalledTimes(1);

    mocks.routeSearch.q = "runner";
    rerender(<SearchPage />);
    expect((input as HTMLInputElement).value).toBe("runner");
  });
});
