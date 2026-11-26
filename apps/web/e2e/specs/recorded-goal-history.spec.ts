import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { profileGoals, profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, withTrpcFailure } from "../pages";
import { withGoalFixture } from "../planning/data";

test("recorded goal history preserves observations, source navigation and read-only recovery", async ({
  actorFactory,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  const athlete = await actorFactory.create("onboarding", { label: "recorded-history-athlete" });
  await e2eDatabase.db
    .update(profiles)
    .set({
      full_name: "Recorded history athlete",
      onboarding_status: "completed",
      planning_timezone: "UTC",
    })
    .where(eq(profiles.id, athlete.profileId));
  const observations: Awaited<ReturnType<typeof e2eData.activities.create>>[] = [];
  for (const daysAgo of [7, 1]) {
    observations.push(
      await e2eData.activities.create({
        actorEmail: athlete.email,
        date: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
        label: `recorded-history-${daysAgo}`,
        name: `Recorded ride ${daysAgo} days ago`,
      }),
    );
  }
  const page = await athlete.createPage("/");
  const goalId = e2eIdentity.uuid("recorded-history-goal");
  const title = e2eIdentity.name("Recorded ten-kilometer ride goal");
  await withGoalFixture(
    async (fixture) => {
      fixture.rememberGoal(goalId);
      await e2eDatabase.db.insert(profileGoals).values({
        id: goalId,
        profile_id: athlete.profileId,
        title,
        priority: 1,
        target_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        activity_category: "bike",
        created_at: new Date(),
        updated_at: new Date(),
        target_payload: {
          type: "event_performance",
          activity_category: "bike",
          distance_m: 10_000,
          target_time_s: 3_600,
        },
      });
      const goalUrl = `/goals/${goalId}`;
      const chart = () => page.getByRole("region", { name: "Recorded elapsed time", exact: true });
      const source = observations[1];
      if (!source) throw new Error("Expected the newer owned observation.");
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(goalUrl);
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(chart().getByRole("img")).toHaveAttribute(
          "aria-label",
          "Recorded elapsed time. Lower time is faster. Loaded history complete. Select a dated observation below.",
        );
        await expect(
          chart()
            .getByRole("group", { name: "Recorded elapsed time observations" })
            .getByRole("button"),
        ).toHaveCount(2);
        await expect(chart().getByText("Best recorded", { exact: true })).toBeVisible();
        await expect(chart().getByText("Gap to target", { exact: true })).toBeVisible();
        await expect(chart().getByText("0 sec", { exact: true })).toBeVisible();
        const link = chart().getByRole("link", { name: `Source activity: ${source.name}` });
        await expect(link).toHaveAttribute("href", source.url);
        await expectNoHorizontalOverflow(page);
        await chart().scrollIntoViewIfNeeded();
        const directory = process.env.E2E_ACCEPTANCE_ARTIFACTS
          ? join(process.env.E2E_ACCEPTANCE_ARTIFACTS, "recorded-history-screenshots")
          : testInfo.outputPath("recorded-history-screenshots");
        mkdirSync(directory, { recursive: true });
        await page.screenshot({
          path: join(directory, `recorded-history-${viewport.width}.png`),
          animations: "disabled",
        });
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${source.url}$`));
        await expect(page.getByRole("heading", { name: source.name, exact: true })).toBeVisible();
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${goalUrl}$`));
        await expect(
          chart().getByRole("link", { name: `Source activity: ${source.name}` }),
        ).toBeVisible();
      }
      await withTrpcFailure(page, "activities.listPaginated", async (failure) => {
        await page.reload();
        await expect(page.getByRole("alert")).toContainText(
          "Recorded history could not be loaded.",
        );
        expect(failure.calls()).toBe(1);
        await expect(page.getByRole("button", { name: "Retry history" })).toBeVisible();
      });
      await page.getByRole("button", { name: "Retry history" }).click();
      await expect(chart().getByRole("img")).toHaveAttribute(
        "aria-label",
        /Loaded history complete/,
      );
      await expect(page.getByText("Recorded history could not be loaded.")).toHaveCount(0);
      await expect
        .poll(() => fixture.getGoal(goalId))
        .toMatchObject({
          title,
          targetPayload: {
            type: "event_performance",
            activity_category: "bike",
            distance_m: 10_000,
            target_time_s: 3_600,
          },
        });
    },
    { profileId: athlete.profileId },
  );
});
