// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordRoutePreviewPage } from "./$routeId";

const mocks = vi.hoisted(() => ({
  getRoute: vi.fn(),
  loadFullRoute: vi.fn(),
  navigate: vi.fn(),
  unitSystem: "metric" as "metric" | "imperial",
  snapshot: null as null | { activity: { routeId: string | null } },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ routeId: "route-1" }),
    useSearch: () => ({}),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record/route">{children}</a>,
}));

vi.mock("../../../../lib/api/client", () => ({
  api: {
    routes: {
      get: { useQuery: () => mocks.getRoute() },
      loadFull: { useQuery: () => mocks.loadFullRoute() },
    },
  },
}));

vi.mock("../../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({ state: { reducer: { snapshot: mocks.snapshot } } }),
}));

vi.mock("../../../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ isLoading: false, unitSystem: mocks.unitSystem }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.unitSystem = "metric";
  mocks.snapshot = null;
});

describe("RecordRoutePreviewPage", () => {
  it("renders the route distance in the viewing user's preferred units", () => {
    mocks.unitSystem = "imperial";
    mocks.getRoute.mockReturnValue({
      data: {
        description: "Flat roads",
        id: "route-1",
        name: "River path",
        total_distance: 12000,
      },
      isLoading: false,
    });
    mocks.loadFullRoute.mockReturnValue({
      data: { coordinates: [] },
      isLoading: false,
    });

    render(<RecordRoutePreviewPage />);

    expect(screen.getAllByText("7.5 mi")).toHaveLength(2);
  });

  it("does not allow route identity changes after the session snapshot locks", () => {
    mocks.snapshot = { activity: { routeId: "locked-route" } };
    mocks.getRoute.mockReturnValue({
      data: {
        description: "Flat roads",
        id: "route-1",
        name: "River path",
        total_distance: 12000,
      },
      isLoading: false,
    });
    mocks.loadFullRoute.mockReturnValue({ data: { coordinates: [] }, isLoading: false });

    render(<RecordRoutePreviewPage />);

    expect(
      (screen.getByRole("button", { name: "Locked for session" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
