import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";
import { profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { createGoalProgressFixture } from "../support/goal-progress-fixture";

function acceptanceScreenshotPath(testInfo: TestInfo, name: string) {
  const artifactRoot = process.env.E2E_ACCEPTANCE_ARTIFACTS;
  if (!artifactRoot) return testInfo.outputPath(name);
  const directory = join(artifactRoot, "goal-progress-screenshots");
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}

test("Home and Plan expose observed threshold-goal progress from canonical athlete evidence", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  const actor = await actorFactory.create("onboarding", { label: "goal-progress-athlete" });
  await e2eDatabase.db
    .update(profiles)
    .set({
      full_name: "Goal progress athlete",
      onboarding_status: "completed",
      planning_timezone: "UTC",
      username: `goal_progress_${actor.profileId.slice(0, 8)}`,
    })
    .where(eq(profiles.id, actor.profileId));
  const athletePage = await actor.createPage("/");
  const title = e2eIdentity.name("Observed bike threshold goal");
  const targetDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const evidence = await createGoalProgressFixture({
    actor,
    database: e2eDatabase,
    identity: e2eIdentity,
  });

  await withGoalFixture(
    async (fixture) => {
      const goals = new GoalsPage(athletePage);
      await goals.startCreate(targetDate);
      const form = athletePage.getByTestId("goal-form");
      await form.getByLabel("Title").fill(title);
      await chooseAuthoringOption(athletePage, "Goal type", "Power threshold");
      await form.getByLabel("Watts").fill("300");
      await form.getByLabel("Test duration").fill("0:30:00");
      fixture.rememberGoalTitle(title);
      await form.getByTestId("goal-submit").click();

      const card = athletePage.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
      await expect(card).toBeVisible();
      const cardId = await card.getAttribute("data-testid");
      if (!cardId) throw new Error("The fixture goal card did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);
      await evidence.assertReadModels(goalId);

      for (const viewport of [
        { width: 1440, height: 1000, label: "1440x1000" },
        { width: 390, height: 844, label: "390x844" },
      ]) {
        await athletePage.setViewportSize(viewport);
        for (const route of ["/", "/plan?date=2026-11-28"]) {
          await athletePage.goto(route);
          const workspace = athletePage.getByRole("region", { name: title });
          await expect(workspace).toBeVisible();
          await expect(workspace.getByRole("link", { name: title })).toHaveAttribute(
            "href",
            `/goals/${goalId}`,
          );
          await expect(workspace.getByText("Current", { exact: true })).toBeVisible();
          await expect(workspace.getByText("285 W", { exact: true })).toBeVisible();
          await expect(workspace.getByText("Target", { exact: true })).toBeVisible();
          await expect(workspace.getByText("300 W", { exact: true })).toBeVisible();
          await expect(workspace.getByText("Remaining gap", { exact: true })).toBeVisible();
          await expect(workspace.getByText("15 W", { exact: true })).toBeVisible();
          await expect(
            workspace.getByText(`Target date: ${targetDate}`, { exact: false }),
          ).toBeVisible();
          await expect(workspace.getByText("Unavailable", { exact: true })).toHaveCount(0);
          await expect(
            workspace.getByRole("img", {
              name: /Threshold history\. Current: 285 W\. Target: 300 W\. Remaining gap: 15 W\./,
            }),
          ).toBeVisible();
          await expect(
            workspace.getByText(/Calculated threshold.*Target.*Deadline.*Assessed/),
          ).toBeVisible();
          await expect(
            workspace.getByRole("link", { name: `Source activity: ${evidence.activityName}` }),
          ).toBeVisible();
          await expectNoHorizontalOverflow(athletePage);
          await workspace.scrollIntoViewIfNeeded();
          await expect(workspace).toBeInViewport();
          const stickyHeader = athletePage.locator("header.sticky").first();
          await expect(stickyHeader).toBeVisible();
          const [headerBox, initialWorkspaceBox] = await Promise.all([
            stickyHeader.boundingBox(),
            workspace.boundingBox(),
          ]);
          if (headerBox && initialWorkspaceBox) {
            const clearance = headerBox.y + headerBox.height + 16 - initialWorkspaceBox.y;
            if (clearance > 0)
              await athletePage.evaluate((offset) => window.scrollBy(0, -offset), clearance);
          }
          const [visibleHeaderBox, visibleWorkspaceBox] = await Promise.all([
            stickyHeader.boundingBox(),
            workspace.boundingBox(),
          ]);
          expect(visibleWorkspaceBox?.y).toBeGreaterThanOrEqual(
            (visibleHeaderBox?.y ?? 0) + (visibleHeaderBox?.height ?? 0),
          );
          await athletePage.screenshot({
            path: acceptanceScreenshotPath(
              testInfo,
              `${route === "/" ? "home" : "plan"}-goal-progress-${viewport.label}.png`,
            ),
          });
          await workspace.getByRole("link", { name: title }).click();
          await expect(
            athletePage.getByRole("heading", { name: title, exact: true }),
          ).toBeVisible();
          await athletePage.goBack();
          await expect(athletePage).toHaveURL(new RegExp(`${route.replace("?", "\\?")}$`));
          const sourceLink = athletePage
            .getByRole("region", { name: title })
            .getByRole("link", { name: `Source activity: ${evidence.activityName}` });
          await sourceLink.click();
          await expect(athletePage).toHaveURL(/\/activities\//);
          await expect(
            athletePage.getByRole("heading", { name: evidence.activityName, exact: true }),
          ).toBeVisible();
          await athletePage.goBack();
          await expect(athletePage).toHaveURL(new RegExp(`${route.replace("?", "\\?")}$`));
        }
      }
    },
    { profileId: actor.profileId },
  );
});
