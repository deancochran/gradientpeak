import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { ActivitiesPage, NotificationsPage, RoutesPage, ShellPage } from "../pages";

const topLevelScreens = [
  { path: "/", name: /welcome back/i },
  { path: "/search", name: /discover training and community/i },
  { path: "/activity-plans", name: /^activity plans$/i },
  { path: "/training-plans", name: /^training plans$/i },
  { path: "/training-preferences", name: /^training preferences$/i },
  { path: "/activities", name: /^activities$/i },
  { path: "/routes", name: /^routes$/i },
  { path: "/groups", name: /^groups$/i },
  { path: "/plan", name: /^plan$/i },
  { path: "/calendar", name: /^calendar$/i },
  { path: "/goals", name: /^goals$/i },
  { path: "/record", name: /^start an indoor activity$/i },
  { path: "/messages", name: /^messages$/i },
  { path: "/notifications", name: /^notifications$/i },
  { path: "/settings", name: /^settings$/i },
  { path: "/integrations", name: /^integrations$/i },
] as const;

test("every protected top-level screen renders without a route failure", async ({
  athletePage,
}) => {
  test.setTimeout(120_000);
  const shell = new ShellPage(athletePage);

  for (const screen of topLevelScreens) {
    await shell.open(screen.path);
    const bodyText = await athletePage.locator("body").innerText();
    await expect(
      athletePage.getByRole("heading", { name: screen.name }).first(),
      `${screen.path} did not expose its page heading. Body: ${bodyText.slice(0, 1_000)}`,
    ).toBeVisible();
    await expectRouteToBeHealthy(athletePage);
  }
});

test("primary empty-state and navigation actions remain usable", async ({ athletePage }) => {
  test.setTimeout(90_000);
  const shell = new ShellPage(athletePage);
  const activities = new ActivitiesPage(athletePage);
  const routes = new RoutesPage(athletePage);
  const notifications = new NotificationsPage(athletePage);

  await shell.open("/search");
  await athletePage.getByRole("tab", { name: "Profiles" }).click();
  const search = athletePage.getByRole("textbox", { name: /search profiles/i });
  await search.fill("zzzz-no-screen-match-7f19");
  await athletePage.getByRole("button", { name: "Search", exact: true }).click();
  await expect(athletePage.getByText("No profiles match your search and filters.")).toBeVisible();
  await athletePage.getByRole("button", { name: /clear search and filters/i }).click();
  await expect(search).toHaveValue("");

  await activities.openLibrary();
  await athletePage.getByRole("button", { name: /import activity/i }).click();
  await expect(athletePage).toHaveURL(/\/activities\/import$/);
  await expect(
    athletePage.getByRole("heading", { name: /import activity history/i }),
  ).toBeVisible();

  await routes.openLibrary();
  await athletePage.getByRole("button", { name: /upload route/i }).click();
  await expect(athletePage).toHaveURL(/\/routes\/upload$/);
  await expect(athletePage.getByRole("heading", { name: /upload route/i })).toBeVisible();

  await notifications.open();
  await athletePage.getByRole("link", { name: /^unread$/i }).click();
  await expect(athletePage).toHaveURL(/\/notifications\?view=unread$/);
  await expect(athletePage.getByText(/no unread notifications/i)).toBeVisible();
});

test("message composer opens from the empty inbox", async ({ athletePage }) => {
  await new ShellPage(athletePage).open("/messages");
  await expect(athletePage).toHaveURL(/\/messages\?compose=false/);
  await athletePage.getByRole("link", { name: /^new message$/i }).click();
  await expect(athletePage).toHaveURL(/\/messages\?compose=true/);
  await expect(athletePage.getByRole("heading", { name: /new message/i })).toBeVisible();
});

test("responsive account navigation exposes every extended product area", async ({
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  await shell.openAccountMenu();

  for (const label of [
    "Activity plans",
    "Training plans",
    "Goals",
    "Groups",
    "Training preferences",
    "Integrations",
  ]) {
    await expect(shell.accountDestination(label)).toBeVisible();
  }
});

async function expectRouteToBeHealthy(page: Page) {
  await expect(page.getByRole("heading", { name: /we could not load this page/i })).toHaveCount(0);
  await expect(page.getByText(/unexpected application error/i)).toHaveCount(0);
}
