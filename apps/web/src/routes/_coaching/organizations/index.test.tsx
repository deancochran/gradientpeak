import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadMyOrganizations: vi.fn(),
  loadMyPendingOrganizationInvitations: vi.fn(),
}));

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
  loadMyPendingOrganizationInvitations: mocks.loadMyPendingOrganizationInvitations,
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
    mocks.loadMyPendingOrganizationInvitations.mockResolvedValue({
      invitations: [],
      hasMore: false,
    });

    await route.loader({ deps: { cursor: "page-2" } });

    expect(mocks.loadMyOrganizations).toHaveBeenCalledWith({
      data: { limit: 20, cursor: "page-2" },
    });
    expect(mocks.loadMyPendingOrganizationInvitations).toHaveBeenCalledWith({
      data: { limit: 20 },
    });
  });

  it("preserves accepted memberships when the separate invitation read fails", async () => {
    const page = { items: [], nextCursor: null, hasMore: false };
    mocks.loadMyOrganizations.mockResolvedValue(page);
    mocks.loadMyPendingOrganizationInvitations.mockRejectedValue(new Error("offline"));

    await expect(route.loader({ deps: { cursor: null } })).resolves.toEqual({
      page,
      invitations: { status: "unavailable" },
    });
  });
});
