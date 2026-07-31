import { expect, test } from "../fixtures";
import { DISCOVERY_SCOPES, waitForProcedure } from "../lane-support/feed/discovery";

test("athlete refreshes and pages the persisted social activity feed", async ({ athletePage }) => {
  await expect(athletePage.getByRole("heading", { name: "Activity feed" })).toBeVisible();

  const refreshResponse = waitForProcedure(athletePage, "feed.getFeed");
  await athletePage.getByRole("button", { name: "Refresh" }).click();
  await expect((await refreshResponse).ok()).toBeTruthy();

  const loadMore = athletePage.getByRole("button", { name: "Load more activities" });
  if (await loadMore.isVisible()) {
    const nextPageResponse = waitForProcedure(athletePage, "feed.getFeed");
    await loadMore.click();
    await expect((await nextPageResponse).ok()).toBeTruthy();
  }
});

test("athlete retries the feed after a refresh failure", async ({ athletePage }) => {
  await expect(athletePage.getByRole("heading", { name: "Activity feed" })).toBeVisible();

  await athletePage.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("feed.getFeed")) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await athletePage.getByRole("button", { name: "Refresh" }).click();
  await expect(athletePage.getByRole("alert")).toContainText(
    /could not load your activity feed|more activities could not be loaded/i,
    { timeout: 15_000 },
  );

  await athletePage.unroute("**/api/trpc/**");
  const recoveryResponse = waitForProcedure(athletePage, "feed.getFeed");
  await athletePage.getByRole("button", { name: /^retry(?: feed)?$/i }).click();
  await expect((await recoveryResponse).ok()).toBeTruthy();
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
});

test("athlete searches every API-backed discovery scope and can page results", async ({
  athletePage,
}) => {
  const initialResponse = waitForProcedure(athletePage, DISCOVERY_SCOPES[0].procedure);
  await athletePage.goto("/search");
  await expect((await initialResponse).ok()).toBeTruthy();
  await expect(
    athletePage.getByRole("heading", { name: "Discover training and community" }),
  ).toBeVisible();

  for (const [index, scope] of DISCOVERY_SCOPES.entries()) {
    if (index > 0) {
      const responsePromise = waitForProcedure(athletePage, scope.procedure);
      await athletePage.getByRole("tab", { name: scope.label }).click();
      await expect((await responsePromise).ok()).toBeTruthy();
    }

    const searchbox = athletePage.getByRole("textbox", {
      name: new RegExp(`search ${scope.label.toLowerCase()}`, "i"),
    });
    await searchbox.fill("zzzz-no-parity-match-7f19");
    const searchResponse = waitForProcedure(athletePage, scope.procedure);
    await athletePage.getByRole("button", { name: "Search", exact: true }).click();
    await expect((await searchResponse).ok()).toBeTruthy();
    await expect(
      athletePage.getByText(`No ${scope.label.toLowerCase()} match your search and filters.`),
    ).toBeVisible();

    const loadMore = athletePage.getByRole("button", {
      name: new RegExp(`load more ${scope.label.toLowerCase()}`, "i"),
    });
    if (await loadMore.isVisible()) {
      const nextPageResponse = waitForProcedure(athletePage, scope.procedure);
      await loadMore.click();
      await expect((await nextPageResponse).ok()).toBeTruthy();
    }

    await searchbox.fill("");
    await athletePage.getByRole("button", { name: "Search", exact: true }).click();
    await expect(searchbox).toHaveValue("");
    await expect(athletePage.getByRole("alert")).toHaveCount(0);
  }
});

test("athlete can retry discovery after an explicit client search failure", async ({
  athletePage,
}) => {
  await athletePage.goto("/search");
  await athletePage.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("activityPlans.list")) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            json: {
              code: -32603,
              data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
              message: "Injected discovery search failure",
            },
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await athletePage.getByRole("textbox", { name: /search activity plans/i }).fill("retry-boundary");
  await athletePage.getByRole("button", { name: "Search", exact: true }).click();
  await expect(athletePage.getByRole("alert")).toContainText("We could not load activity plans.", {
    timeout: 15_000,
  });
  await athletePage.unroute("**/api/trpc/**");

  const recoveryResponse = waitForProcedure(athletePage, "activityPlans.list");
  await athletePage.getByRole("button", { name: "Retry activity plans" }).click();
  await expect((await recoveryResponse).ok()).toBeTruthy();
  await expect(athletePage.getByRole("alert")).toHaveCount(0);
});
