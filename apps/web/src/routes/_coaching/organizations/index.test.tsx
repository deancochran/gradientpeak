import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadMyOrganizations: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useLoaderData: () => ({}) }),
}));

vi.mock("../../../components/coaching/organization-selector", () => ({
  OrganizationSelector: () => null,
  OrganizationSelectorError: () => null,
  OrganizationSelectorPending: () => null,
}));

vi.mock("../../../lib/coaching/server-functions", () => ({
  loadMyOrganizations: mocks.loadMyOrganizations,
}));

import { Route } from "./index";

type RouteContract = {
  validateSearch: (search: Record<string, unknown>) => { cursor?: string };
  loaderDeps: (input: { search: { cursor?: string } }) => { cursor: string | null };
  loader: (input: { deps: { cursor: string | null } }) => Promise<unknown>;
};

const route = Route as unknown as RouteContract;

describe("coaching organizations route", () => {
  it("strictly validates the optional URL cursor and keeps it in loader cache identity", () => {
    expect(route.validateSearch({})).toEqual({});
    expect(route.validateSearch({ cursor: "page-2" })).toEqual({ cursor: "page-2" });
    expect(() => route.validateSearch({ cursor: "" })).toThrow();
    expect(() => route.validateSearch({ cursor: "a".repeat(1025) })).toThrow();
    expect(() => route.validateSearch({ cursor: "page-2", extra: "no" })).toThrow();
    expect(route.loaderDeps({ search: {} })).toEqual({ cursor: null });
    expect(route.loaderDeps({ search: { cursor: "page-2" } })).toEqual({ cursor: "page-2" });
  });

  it("loads the requested URL-owned cursor page with the fixed page size", async () => {
    mocks.loadMyOrganizations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });

    await route.loader({ deps: { cursor: "page-2" } });

    expect(mocks.loadMyOrganizations).toHaveBeenCalledWith({
      data: { limit: 20, cursor: "page-2" },
    });
  });
});
