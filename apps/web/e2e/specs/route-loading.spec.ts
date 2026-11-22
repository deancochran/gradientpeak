import { profileGoals } from "@repo/db/schema";
import { expect, test } from "../fixtures";
import { createLocalAuthoringPage } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";

test("route loading renders critical goal HTML and hydrates without a duplicate primary query", async ({
  athleteActor,
  e2eDatabase,
  e2eIdentity,
}) => {
  const page = await createLocalAuthoringPage(athleteActor);
  // Let the disposable Vite server finish optimizing common dependencies before
  // observing the target document. This does not load or cache the goal below.
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]').first()).toBeVisible();
  await withGoalFixture(async (fixture) => {
    const id = e2eIdentity.uuid("route-loading-goal");
    const title = e2eIdentity.name("SSR route goal");
    fixture.rememberGoal(id);
    await e2eDatabase.typedTransaction((transaction) =>
      transaction.insert(profileGoals).values({
        id,
        profile_id: athleteActor.profileId,
        title,
        target_date: "2026-12-01",
        activity_category: "run",
        priority: 4,
        target_payload: { type: "completion", distance_m: 5000 },
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );
    const primaryRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/trpc/") && request.url().includes("goals.getById")) {
        primaryRequests.push(request.url());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.name));
    const response = await page.goto(`/goals/${id}`);
    expect(response?.ok()).toBe(true);
    // The heading must exist in server HTML, not just the serialized Query payload.
    expect(await response?.text()).toContain(`>${title}</h1>`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.locator('[aria-busy="false"]').first()).toBeVisible();
    expect(primaryRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    const documentRequests: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documentRequests.push(request.resourceType());
    });
    await page.getByRole("link", { name: "Back to goals", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/goals");
    const goalLink = page.locator(`a[href="/goals/${id}"]`);
    await goalLink.hover();
    await goalLink.click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect(documentRequests).toEqual([]);
    expect(primaryRequests).toEqual([]);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/goals");
    await page.goForward();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect(primaryRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
