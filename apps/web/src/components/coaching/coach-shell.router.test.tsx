// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { CoachShell } from "./coach-shell";

afterEach(cleanup);

const organizationId = "11111111-1111-4111-8111-111111111111";

function createCoachingRouter(initialEntry: string) {
  const root = createRootRoute({ component: Outlet });
  const organizations = createRoute({
    getParentRoute: () => root,
    path: "organizations",
    component: Outlet,
  });
  const organization = createRoute({
    getParentRoute: () => organizations,
    path: "$organizationId",
    component: Outlet,
  });
  const shell = () => (
    <CoachShell
      organization={{ id: organizationId, name: "Summit Coaching", slug: "summit-coaching" }}
    />
  );
  const routes = [
    createRoute({ getParentRoute: () => organization, path: "coaching", component: shell }),
    createRoute({ getParentRoute: () => organization, path: "athletes", component: shell }),
    createRoute({
      getParentRoute: () => organization,
      path: "athletes/$athleteId",
      component: shell,
    }),
    createRoute({ getParentRoute: () => organization, path: "assignments", component: shell }),
    createRoute({ getParentRoute: () => organization, path: "audit", component: shell }),
    createRoute({ getParentRoute: () => organization, path: "dashboard", component: shell }),
  ];
  const personal = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: root.addChildren([
      personal,
      organizations.addChildren([organization.addChildren(routes)]),
    ]),
  });
  return router;
}

it("uses the coaching destination matcher, not Router's fuzzy Organizations match", async () => {
  const router = createCoachingRouter(`/organizations/${organizationId}/athletes/athlete-1`);
  await router.load();
  render(<RouterProvider router={router} />);

  const desktopNavigation = await screen.findByRole("navigation", { name: "Coaching navigation" });
  expect(within(desktopNavigation).getAllByRole("link", { current: "page" })).toHaveLength(1);
  expect(
    within(desktopNavigation).getByRole("link", { name: "Athletes" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    within(desktopNavigation)
      .getByRole("link", { name: "Organizations" })
      .getAttribute("aria-current"),
  ).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Open coaching navigation" }));
  const compactNavigation = screen.getByRole("navigation", { name: "Mobile coaching navigation" });
  expect(within(compactNavigation).getAllByRole("link", { current: "page" })).toHaveLength(1);
  expect(
    within(compactNavigation).getByRole("link", { name: "Athletes" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    within(compactNavigation)
      .getByRole("link", { name: "Organizations" })
      .getAttribute("aria-current"),
  ).toBeNull();
});
