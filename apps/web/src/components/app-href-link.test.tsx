// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AppHrefLink } from "./app-href-link";

afterEach(cleanup);

it("preserves browser-native downloads for internal hrefs", () => {
  render(
    <AppHrefLink href="/exports/activity.fit" download="activity.fit">
      Download activity
    </AppHrefLink>,
  );
  const link = screen.getByRole("link", { name: "Download activity" });
  expect(link.getAttribute("href")).toBe("/exports/activity.fit");
  expect(link.getAttribute("download")).toBe("activity.fit");
  expect(link.hasAttribute("data-status")).toBe(false);
});

it("navigates href DTOs with parsed search and hash without document navigation", async () => {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <AppHrefLink href="/event?resourceType=planned_session#details">Open session</AppHrefLink>
    ),
  });
  const event = createRoute({
    getParentRoute: () => root,
    path: "/event",
    validateSearch: (s) => ({ resourceType: s.resourceType }),
    component: () => <h1>Session</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, event]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole("link", { name: "Open session" }));
  await screen.findByRole("heading", { name: "Session" });
  expect(router.state.location.pathname).toBe("/event");
  expect(router.state.location.search).toEqual({ resourceType: "planned_session" });
  expect(router.state.location.hash).toBe("details");
});

it("keeps external URLs and local fragments browser-native", () => {
  render(
    <>
      <AppHrefLink href="https://example.org/export" download>
        Export
      </AppHrefLink>
      <AppHrefLink href="#details">Section</AppHrefLink>
    </>,
  );
  expect(screen.getByRole("link", { name: "Export" }).getAttribute("href")).toBe(
    "https://example.org/export",
  );
  expect(screen.getByRole("link", { name: "Export" }).hasAttribute("download")).toBe(true);
  expect(screen.getByRole("link", { name: "Section" }).getAttribute("href")).toBe("#details");
});
