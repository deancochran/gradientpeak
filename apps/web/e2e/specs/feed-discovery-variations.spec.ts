import { expect, test } from "../fixtures";
import { waitForProcedure } from "../lane-support/feed/discovery";
import { withTrpcFailure } from "../pages";

test("[variation:feed.refresh:keyboard] keyboard refresh completes and keeps the activity feed interactive", async ({
  athletePage,
}) => {
  await athletePage.goto("/");
  const refresh = athletePage.getByRole("button", { name: "Refresh" });
  await refresh.focus();
  await expect(refresh).toBeFocused();
  const response = waitForProcedure(athletePage, "feed.getFeed");
  await refresh.press("Enter");
  await expect((await response).ok()).toBeTruthy();
  await expect(athletePage.getByRole("heading", { name: "Activity feed" })).toBeVisible();
  await expect(refresh).toBeEnabled();
});

test("[variation:feed.pagination:reload] loaded feed content remains usable after pagination and reload", async ({
  athletePage,
}) => {
  await athletePage.goto("/");
  const initialCards = athletePage.locator('[data-testid^="feed-activity-"]');
  const before = await initialCards.count();
  const more = athletePage.getByRole("button", { name: "Load more activities" });
  if (await more.isVisible()) {
    const response = waitForProcedure(athletePage, "feed.getFeed");
    await more.click();
    await expect((await response).ok()).toBeTruthy();
    await expect(initialCards).not.toHaveCount(before);
  }
  await athletePage.reload();
  await expect(athletePage.getByRole("heading", { name: "Activity feed" })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: "Refresh" })).toBeEnabled();
});

test("[variation:feed.retry:cached-content] refresh failure leaves existing feed content visible until retry succeeds", async ({
  athletePage,
}) => {
  await athletePage.goto("/");
  const heading = athletePage.getByRole("heading", { name: "Activity feed" });
  await expect(heading).toBeVisible();
  await withTrpcFailure(athletePage, "feed.getFeed", async () => {
    await athletePage.getByRole("button", { name: "Refresh" }).click();
    await expect(athletePage.getByRole("alert")).toContainText(
      /could not load your activity feed/i,
    );
    await expect(heading).toBeVisible();
  });
  await athletePage.getByRole("button", { name: /^retry(?: feed)?$/i }).press("Enter");
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await expect(heading).toBeVisible();
});

test("[variation:feed.retry:second-failure] a second deterministic refresh failure remains retryable before recovery", async ({
  athletePage,
}) => {
  await athletePage.goto("/");
  let failures = 0;
  await withTrpcFailure(
    athletePage,
    "feed.getFeed",
    async (interception) => {
      await athletePage.getByRole("button", { name: "Refresh" }).click();
      await expect(athletePage.getByRole("alert")).toBeVisible();
      await athletePage.getByRole("button", { name: /^retry(?: feed)?$/i }).click();
      await expect(athletePage.getByRole("alert")).toBeVisible();
      failures = interception.calls();
    },
    { times: 2 },
  );
  await athletePage.getByRole("button", { name: /^retry(?: feed)?$/i }).click();
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  expect(failures).toBe(2);
});

test("[variation:discovery.scopes:profile-detail] exact profile search opens a real profile and back retains the profiles scope", async ({
  athletePage,
}) => {
  await athletePage.goto("/search");
  const response = waitForProcedure(athletePage, "social.searchUsers");
  await athletePage.getByRole("tab", { name: "Profiles" }).press("Enter");
  await athletePage.getByRole("textbox", { name: /search profiles/i }).fill("playwright_coach");
  await athletePage.getByRole("button", { name: "Search", exact: true }).press("Enter");
  await expect((await response).ok()).toBeTruthy();
  const result = athletePage.getByTestId(/^discover-users-/).first();
  await result.getByRole("link", { name: "View profile" }).click();
  await expect(athletePage.getByRole("heading", { level: 1 })).toBeVisible();
  await athletePage.goBack();
  await expect(athletePage.getByRole("tab", { name: "Profiles" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(athletePage.getByRole("textbox", { name: /search profiles/i })).toHaveValue(
    "playwright_coach",
  );
});

test("[variation:discovery.retry:query-retention] failed activity-plan query remains in the form and succeeds through keyboard retry", async ({
  athletePage,
}) => {
  await athletePage.goto("/search");
  const search = athletePage.getByRole("textbox", { name: /search activity plans/i });
  await withTrpcFailure(athletePage, "activityPlans.list", async () => {
    await search.fill("Tempo Builder");
    await athletePage.getByRole("button", { name: "Search", exact: true }).click();
    await expect(athletePage.getByRole("alert")).toContainText("We could not load activity plans.");
    await expect(search).toHaveValue("Tempo Builder");
  });
  await athletePage.getByRole("button", { name: "Retry activity plans" }).press("Enter");
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await expect(
    athletePage.getByRole("button", { name: /playwright tempo builder/i }),
  ).toBeVisible();
});

test("[variation:discovery.retry:scope-switch] another discovery scope remains usable while one scope fails and the failed scope later recovers", async ({
  athletePage,
}) => {
  await athletePage.goto("/search");
  await withTrpcFailure(athletePage, "activityPlans.list", async () => {
    await athletePage.getByRole("textbox", { name: /search activity plans/i }).fill("retry-scope");
    await athletePage.getByRole("button", { name: "Search", exact: true }).click();
    await expect(athletePage.getByRole("alert")).toBeVisible();
    const routeResponse = waitForProcedure(athletePage, "routes.list");
    await athletePage.getByRole("tab", { name: "Routes" }).click();
    await expect((await routeResponse).ok()).toBeTruthy();
  });
  await athletePage.getByRole("tab", { name: "Activity plans" }).click();
  await athletePage.getByRole("button", { name: "Retry activity plans" }).click();
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
  await expect(athletePage.getByRole("textbox", { name: /search activity plans/i })).toHaveValue(
    "retry-scope",
  );
});
