// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invalidate: vi.fn(),
  options: {} as Record<string, unknown>,
  organizationId: "org-a",
  actorProfileId: "actor-a",
  search: {} as Record<string, string>,
  location: { pathname: "/organizations/org-a/audit", search: {} as Record<string, string> },
  loaded: {
    organizationId: "org-a",
    actorProfileId: "actor-a",
    filterKey: "{}",
    result: { status: "granted", page: { items: [], nextCursor: null, hasMore: false } },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => {
    state.options = options;
    return {
      ...options,
      useLoaderData: () => state.loaded,
      useParams: () => ({ organizationId: state.organizationId }),
      useRouteContext: () => ({ actorProfileId: state.actorProfileId }),
      useSearch: () => state.search,
    };
  },
  useRouter: () => ({ invalidate: state.invalidate }),
  useRouterState: () => state.location,
  Link: ({ children }: { children: ReactNode }) => <a href="/organizations">{children}</a>,
}));
vi.mock(
  "../../../../components/coaching/organization-audit-history/organization-audit-history",
  () => ({
    OrganizationAuditHistory: () => <div>Private audit rows</div>,
  }),
);
vi.mock("../../../../lib/coaching/audit-history-server-functions", () => ({
  loadOrganizationAuditHistory: vi.fn(),
}));
import "./audit";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.organizationId = "org-a";
  state.actorProfileId = "actor-a";
  state.search = {};
  state.location = { pathname: "/organizations/org-a/audit", search: {} };
});

it.each([
  "path",
  "organization",
  "actor",
  "live-search",
  "loaded-search",
])("hides prior audit data when %s identity changes before the response", (change) => {
  if (change === "path") state.location.pathname = "/organizations/org-b/audit";
  if (change === "organization") {
    state.organizationId = "org-b";
    state.location.pathname = "/organizations/org-b/audit";
  }
  if (change === "actor") state.actorProfileId = "actor-b";
  if (change === "live-search") state.location.search = { action: "new-action" };
  if (change === "loaded-search") {
    state.search = { action: "new-action" };
    state.location.search = state.search;
  }
  const Page = state.options.component as ComponentType;
  render(<Page />);
  expect(screen.getByRole("status").textContent).toContain("Loading audit history");
  expect(screen.queryByText("Private audit rows")).toBeNull();
});

it("renders matching audit data and accepts a direct-link trailing slash", () => {
  state.location.pathname += "/";
  const Page = state.options.component as ComponentType;
  render(<Page />);
  expect(screen.getByText("Private audit rows")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

it("announces pending history without an empty or success claim", () => {
  const Pending = state.options.pendingComponent as ComponentType;
  render(<Pending />);
  expect(screen.getByRole("status").textContent).toContain("Loading audit history");
  expect(screen.queryByRole("table")).toBeNull();
});

it("retries a failed read, prevents duplicate retries and keeps the failure visible", async () => {
  let rejectRead: (reason: Error) => void = () => {
    throw new Error("Read not started");
  };
  state.invalidate.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectRead = reject;
      }),
  );
  const ErrorView = state.options.errorComponent as ComponentType;
  render(<ErrorView />);
  fireEvent.click(screen.getByRole("button", { name: "Retry audit history" }));
  expect(
    screen.getByRole("button", { name: "Retrying audit history…" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(state.invalidate).toHaveBeenCalledExactlyOnceWith({ sync: true });
  rejectRead(new Error("offline"));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Retry audit history" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(screen.getByRole("alert").textContent).toContain("submitted filters are retained");
  expect(screen.getByRole("link", { name: "Return to organizations" })).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  state.invalidate.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Retry audit history" }));
  await waitFor(() => expect(state.invalidate).toHaveBeenCalledTimes(2));
});
