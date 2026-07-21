// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordRoutePage } from "./index";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  navigate: vi.fn(),
  unitSystem: "metric" as "metric" | "imperial",
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => ({}),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record">{children}</a>,
}));

vi.mock("../../../../lib/api/client", () => ({
  api: { routes: { list: { useInfiniteQuery: () => mocks.list() } } },
}));

vi.mock("../../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({ state: { reducer: { snapshot: null } } }),
}));

vi.mock("../../../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ isLoading: false, unitSystem: mocks.unitSystem }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.unitSystem = "metric";
});

describe("RecordRoutePage search", () => {
  it("retains local filtering, pagination, loading, and shared clear selectors", () => {
    const fetchNextPage = vi.fn();
    mocks.list.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                description: "Rocky climb",
                id: "route-1",
                name: "Mountain loop",
                total_distance: 12000,
              },
              {
                description: "Flat roads",
                id: "route-2",
                name: "River path",
                total_distance: 8000,
              },
            ],
          },
        ],
      },
      error: null,
      fetchNextPage,
      hasNextPage: true,
      isFetching: true,
      isFetchingNextPage: false,
      isLoading: false,
    });
    render(<RecordRoutePage />);

    expect(screen.getByRole("status", { name: "Loading routes" })).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: "Search routes" });
    expect(search.getAttribute("name")).toBe("routeSearch");
    fireEvent.change(search, { target: { value: "mountain" } });
    expect(screen.getByText("Mountain loop")).toBeTruthy();
    expect(screen.getByText("12.0 km")).toBeTruthy();
    expect(screen.queryByText("River path")).toBeNull();

    fireEvent.click(screen.getByTestId("record-route-search-clear"));
    expect(screen.getByText("River path")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more routes" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("renders route distances in the viewing user's preferred units", () => {
    mocks.unitSystem = "imperial";
    mocks.list.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                description: "Rocky climb",
                id: "route-1",
                name: "Mountain loop",
                total_distance: 12000,
              },
            ],
          },
        ],
      },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
    });

    render(<RecordRoutePage />);

    expect(screen.getByText("7.5 mi")).toBeTruthy();
  });
});
