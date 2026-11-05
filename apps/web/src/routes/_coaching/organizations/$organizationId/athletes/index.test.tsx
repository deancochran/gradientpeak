import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => ({ status: "forbidden" }),
    useParams: () => ({ organizationId: "11111111-1111-4111-8111-111111111111" }),
    useRouteContext: () => ({ actorProfileId: "coach" }),
    useSearch: () => ({}),
  }),
}));
vi.mock("../../../../../lib/coaching/athletes-server-functions", () => ({
  loadOrganizationAthletesLanding: mocks.load,
}));
vi.mock("../../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => null,
}));
vi.mock("../../../../../components/coaching/athletes/administrative-athlete-roster", () => ({
  AdministrativeAthleteRoster: () => null,
}));
vi.mock("../../../../../components/coaching/athletes/assigned-athlete-directory", () => ({
  AssignedAthleteDirectory: () => null,
}));

import { Route } from "./index";

describe("assigned athletes route", () => {
  it("keeps directory search and cursor in the route cache identity", async () => {
    const route = Route as unknown as {
      validateSearch: (value: unknown) => unknown;
      loaderDeps: (input: { search: { q?: string; cursor?: string } }) => unknown;
      loader: (input: {
        params: { organizationId: string };
        deps: { search: string | null; cursor: string | null };
      }) => Promise<unknown>;
    };
    expect(route.validateSearch({ q: "Ada" })).toEqual({ q: "Ada" });
    expect(route.loaderDeps({ search: {} })).toEqual({ search: null, cursor: null });
    mocks.load.mockResolvedValueOnce({ status: "forbidden" });
    const loaded = await route.loader({
      params: { organizationId: "11111111-1111-4111-8111-111111111111" },
      deps: { search: "Ada", cursor: null },
    });
    expect(loaded).toEqual({
      organizationId: "11111111-1111-4111-8111-111111111111",
      search: "Ada",
      cursor: null,
      page: { status: "forbidden" },
    });
    expect(mocks.load).toHaveBeenCalledWith({
      data: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        limit: 20,
        search: "Ada",
        cursor: null,
      },
    });
  });
});
