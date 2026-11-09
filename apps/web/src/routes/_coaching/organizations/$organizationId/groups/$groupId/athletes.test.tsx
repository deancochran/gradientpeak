import { describe, expect, it, vi } from "vitest";

type RouteConfig = {
  loader: (input: {
    params: { organizationId: string; groupId: string };
    context: { actorProfileId: string };
  }) => Promise<unknown>;
  pendingMs?: number;
  pendingComponent?: unknown;
  errorComponent?: unknown;
};
function isRouteConfig(value: unknown): value is RouteConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "loader" in value &&
    typeof value.loader === "function"
  );
}
const state = vi.hoisted((): { load: ReturnType<typeof vi.fn>; route: RouteConfig } => ({
  load: vi.fn(),
  route: {
    loader: async (_input: {
      params: { organizationId: string; groupId: string };
      context: { actorProfileId: string };
    }) => undefined,
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (route: unknown) => {
    if (isRouteConfig(route)) state.route = route;
    return {
      useLoaderData: () => ({ status: "forbidden" }),
      useParams: () => ({
        organizationId: "11111111-1111-4111-8111-111111111111",
        groupId: "22222222-2222-4222-8222-222222222222",
      }),
    };
  },
}));
vi.mock("../../../../../../lib/coaching/organization-group-athletes-server-functions", () => ({
  loadOrganizationGroupAthleteWorkflow: state.load,
}));
vi.mock(
  "../../../../../../components/coaching/organization-group-athletes/organization-group-athletes",
  () => ({
    OrganizationGroupAthletes: () => null,
    OrganizationGroupAthletesError: () => null,
    OrganizationGroupAthletesPending: () => null,
  }),
);
vi.mock("../../../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => null,
}));

import { Route } from "./athletes";

describe("organization group athlete route", () => {
  it("loads the child workflow with both route identities and bounded pagination", async () => {
    state.load.mockResolvedValueOnce({ status: "granted", links: {}, candidates: {} });
    await expect(
      state.route.loader({
        params: {
          organizationId: "11111111-1111-4111-8111-111111111111",
          groupId: "22222222-2222-4222-8222-222222222222",
        },
        context: { actorProfileId: "profile-1" },
      }),
    ).resolves.toEqual({
      organizationId: "11111111-1111-4111-8111-111111111111",
      groupId: "22222222-2222-4222-8222-222222222222",
      actorProfileId: "profile-1",
      result: { status: "granted", links: {}, candidates: {} },
    });
    expect(state.load).toHaveBeenCalledWith({
      data: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        groupId: "22222222-2222-4222-8222-222222222222",
        limit: 20,
        cursor: null,
      },
    });
    expect(Route).toBeDefined();
    expect(state.route.pendingMs).toBe(0);
    expect(state.route.pendingComponent).toBeTruthy();
    expect(state.route.errorComponent).toBeTruthy();
  });
});
