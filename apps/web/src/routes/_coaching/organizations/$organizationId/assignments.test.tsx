import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => ({ status: "forbidden" }),
    useParams: () => ({ organizationId: "11111111-1111-4111-8111-111111111111" }),
    useRouteContext: () => ({ actorProfileId: "profile" }),
    useSearch: () => ({}),
  }),
  useRouterState: () => ({ location: { pathname: "/", search: {} } }),
}));
vi.mock("../../../../lib/coaching/assignment-directory-server-functions", () => ({
  loadOrganizationAssignmentDirectory: mocks.load,
}));
vi.mock("../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => null,
}));
vi.mock(
  "../../../../components/coaching/organization-coaching-assignments/assignment-directory",
  () => ({
    AssignmentDirectory: () => null,
  }),
);

import { Route } from "./assignments";

describe("coach assignment directory route", () => {
  it("keeps roster pagination and page-local search in the loader identity", async () => {
    const route = Route as unknown as {
      validateSearch: (value: unknown) => unknown;
      loaderDeps: (input: { search: { q?: string; cursor?: string } }) => unknown;
      loader: (input: {
        params: { organizationId: string };
        deps: { search: string | null; cursor: string | null };
      }) => Promise<unknown>;
    };
    expect(route.validateSearch({ q: " Alex " })).toEqual({ q: "Alex" });
    expect(() => route.validateSearch({ q: "   " })).toThrow();
    expect(route.loaderDeps({ search: {} })).toEqual({ search: null, cursor: null });
    mocks.load.mockResolvedValueOnce({ status: "forbidden" });
    await expect(
      route.loader({
        params: { organizationId: "11111111-1111-4111-8111-111111111111" },
        deps: { search: "Alex", cursor: null },
      }),
    ).resolves.toEqual({
      organizationId: "11111111-1111-4111-8111-111111111111",
      search: "Alex",
      cursor: null,
      page: { status: "forbidden" },
    });
    expect(mocks.load).toHaveBeenCalledWith({
      data: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        limit: 20,
        cursor: null,
      },
    });
  });
});
