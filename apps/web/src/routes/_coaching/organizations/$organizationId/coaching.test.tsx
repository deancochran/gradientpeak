// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actorProfileId: "owner-a",
  invalidate: vi.fn<() => Promise<void>>(),
  load: vi.fn(),
  location: { pathname: "/organizations/org-a/coaching" },
  options: {} as Record<string, unknown>,
  organizationId: "org-a",
  loaded: {
    actorProfileId: "owner-a",
    organizationId: "org-a",
    result: {
      status: "granted" as const,
      overview: {
        scopeKind: "organization_admin" as const,
        scopeExplanation: "Current organization engagements.",
        snapshotAsOf: new Date("2026-01-01T00:00:00.000Z"),
        definitions: {
          version: "coaching-quality-overview.v1" as const,
          activeEngagements: "Active means current and not paused.",
          pausedEngagements: "Paused means current and paused.",
          activeWithoutPrimary: "No active primary assignment.",
          snapshotAsOf: "Read timestamp.",
        },
        aggregates: {
          activeEngagementCount: 2,
          pausedEngagementCount: 1,
          activeWithoutPrimaryCount: 1,
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  createFileRoute: () => (options: Record<string, unknown>) => {
    state.options = options;
    return {
      ...options,
      useLoaderData: () => state.loaded,
      useParams: () => ({ organizationId: state.organizationId }),
      useRouteContext: () => ({ actorProfileId: state.actorProfileId }),
    };
  },
  useRouter: () => ({ invalidate: state.invalidate }),
  useRouterState: ({
    select,
  }: {
    select: (routerState: { location: typeof state.location }) => unknown;
  }) => select({ location: state.location }),
}));

vi.mock("../../../../lib/coaching/organization-coaching-quality-server-functions", () => ({
  loadOrganizationCoachingQuality: state.load,
}));

import { Route } from "./coaching";

function resetState() {
  state.actorProfileId = "owner-a";
  state.organizationId = "org-a";
  state.location = { pathname: "/organizations/org-a/coaching" };
  state.loaded = {
    actorProfileId: "owner-a",
    organizationId: "org-a",
    result: {
      status: "granted",
      overview: {
        scopeKind: "organization_admin",
        scopeExplanation: "Current organization engagements.",
        snapshotAsOf: new Date("2026-01-01T00:00:00.000Z"),
        definitions: {
          version: "coaching-quality-overview.v1",
          activeEngagements: "Active means current and not paused.",
          pausedEngagements: "Paused means current and paused.",
          activeWithoutPrimary: "No active primary assignment.",
          snapshotAsOf: "Read timestamp.",
        },
        aggregates: {
          activeEngagementCount: 2,
          pausedEngagementCount: 1,
          activeWithoutPrimaryCount: 1,
        },
      },
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetState();
});

describe("organization coaching facts route", () => {
  it("binds its aggregate read to the current organization", async () => {
    const route = Route as unknown as {
      loader: (input: {
        params: { organizationId: string };
        context: { actorProfileId: string };
      }) => Promise<unknown>;
    };
    state.load.mockResolvedValueOnce({ status: "forbidden" });

    await expect(
      route.loader({
        params: { organizationId: "11111111-1111-4111-8111-111111111111" },
        context: { actorProfileId: "owner-loader" },
      }),
    ).resolves.toEqual({
      organizationId: "11111111-1111-4111-8111-111111111111",
      actorProfileId: "owner-loader",
      result: { status: "forbidden" },
    });
    expect(state.load).toHaveBeenCalledWith({
      data: { organizationId: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it.each(["actor", "organization", "path"])("hides facts when the %s becomes stale", (change) => {
    if (change === "actor") state.actorProfileId = "owner-b";
    if (change === "organization") {
      state.organizationId = "org-b";
      state.location.pathname = "/organizations/org-b/coaching";
    }
    if (change === "path") state.location.pathname = "/organizations/org-a/dashboard";

    const Page = state.options.component as ComponentType;
    render(<Page />);

    expect(screen.getByRole("status", { name: "Loading coaching assignment facts" })).toBeTruthy();
    expect(screen.queryByTestId("coaching-assignment-facts")).toBeNull();
    expect(screen.queryByText("Current organization engagements.")).toBeNull();
  });

  it("shows denial without leaking the aggregate", () => {
    state.loaded.result = { status: "forbidden" } as unknown as typeof state.loaded.result;
    const Page = state.options.component as ComponentType;
    render(<Page />);

    expect(screen.getByRole("heading", { name: "Organization access unavailable" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Return to Personal workspace" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByTestId("coaching-assignment-facts")).toBeNull();
    expect(screen.queryByText("Current organization engagements.")).toBeNull();
  });

  it("renders the route pending shell", () => {
    const Pending = state.options.pendingComponent as ComponentType;
    render(<Pending />);
    expect(screen.getByRole("status", { name: "Loading coaching assignment facts" })).toBeTruthy();
  });

  it("keeps a generic read failure visible and retries through router invalidation", async () => {
    let release: (() => void) | undefined;
    state.invalidate.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const ErrorPage = state.options.errorComponent as ComponentType;
    render(<ErrorPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "could not load coaching assignment facts",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry coaching assignment facts" }));
    expect(state.invalidate).toHaveBeenCalledWith({ sync: true });
    expect(
      (
        screen.getByRole("button", {
          name: "Retrying coaching assignment facts…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    release?.();
    const retryButton = (await screen.findByRole("button", {
      name: "Retry coaching assignment facts",
    })) as HTMLButtonElement;
    expect(retryButton.disabled).toBe(false);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
