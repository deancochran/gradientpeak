import type { Page, TestInfo } from "@playwright/test";
import { activities, profiles, thresholds } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { seedBikeThresholdEvidence } from "../support/athlete-evidence";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
}

test("athlete threshold history keeps real power and heart-rate evidence in separate visual scales", async ({
  athleteActor,
  athletePage: page,
  e2eDatabase,
}, testInfo) => {
  const compact = (page.viewportSize()?.width ?? 1440) < 600;
  await page.setViewportSize(compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const now = Date.now();
  await seedBikeThresholdEvidence({
    db: e2eDatabase.db,
    profileId: athleteActor.profileId,
    completedAt: new Date(now - 8 * 24 * 60 * 60 * 1_000),
    name: "Earlier threshold effort",
  });
  const latest = await seedBikeThresholdEvidence({
    db: e2eDatabase.db,
    profileId: athleteActor.profileId,
    completedAt: new Date(now - 60 * 60 * 1_000),
    name: "Latest threshold effort",
    powerWatts: 300,
    heartRateBpm: 175,
  });
  const evidence = await e2eDatabase.db
    .select({ metric: thresholds.metric, value: thresholds.value, unit: thresholds.unit })
    .from(thresholds)
    .where(eq(thresholds.profile_id, athleteActor.profileId));
  expect(evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ metric: "power", unit: "watts" }),
      expect.objectContaining({ metric: "lthr", unit: "bpm" }),
    ]),
  );

  await page.goto("/thresholds");
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "Thresholds", exact: true })).toBeVisible();
  const power = page.getByRole("img", { name: /bike.*power/i });
  const heartRate = page.getByRole("img", { name: /bike.*(heart.rate|lthr)/i });
  await expect(power).toBeVisible();
  await expect(heartRate).toBeVisible();
  await expect(power).toHaveAccessibleName(/\bW\b/);
  await expect(power).not.toHaveAccessibleName(/\bbpm\b/);
  await expect(heartRate).toHaveAccessibleName(/\bbpm\b/);
  await expect(heartRate).not.toHaveAccessibleName(/\bW\b/);
  await capture(page, testInfo, `threshold-metric-scales-${compact ? "compact" : "desktop"}`);

  const source = page.locator(`a[href="/activities/${latest.activityId}"]`).first();
  await expect(source).toHaveAccessibleName(/Latest threshold effort/);
  await source.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/activities/${latest.activityId}`);
  await expect(
    page.getByRole("heading", { name: "Latest threshold effort", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/thresholds\/?$/);
  await expect(power).toBeVisible();
  await expect(heartRate).toBeVisible();
});

test("new athlete threshold evidence remains unavailable instead of fabricated zero trends", async ({
  actorFactory,
  e2eDatabase,
}, testInfo) => {
  // The default athlete preset includes a historical power threshold. Start with
  // the unseeded onboarding preset and complete only its synthetic profile.
  const actor = await actorFactory.create("onboarding", { label: "athlete-without-evidence" });
  await e2eDatabase.db
    .update(profiles)
    .set({
      full_name: "New athlete",
      onboarding_status: "completed",
      planning_timezone: "UTC",
      username: `no_evidence_${actor.profileId.slice(0, 8)}`,
    })
    .where(eq(profiles.id, actor.profileId));
  expect(
    await e2eDatabase.db
      .select({ id: thresholds.id })
      .from(thresholds)
      .where(eq(thresholds.profile_id, actor.profileId)),
  ).toEqual([]);
  expect(
    await e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, actor.profileId)),
  ).toEqual([]);
  const page = await actor.createPage("/");
  const compact = (page.viewportSize()?.width ?? 1440) < 600;
  await page.setViewportSize(compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.goto("/thresholds");
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "Thresholds", exact: true })).toBeVisible();
  await expect(
    page.getByText("No calculated threshold changes yet.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /bike.*power/i })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /bike.*(heart.rate|lthr)/i })).toHaveCount(0);
  await capture(page, testInfo, `threshold-no-evidence-${compact ? "compact" : "desktop"}`);
});
