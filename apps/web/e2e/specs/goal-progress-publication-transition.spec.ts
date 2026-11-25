import { profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { createGoalProgressFixture } from "../support/goal-progress-fixture";

test("canonical threshold evidence advances the published revision after a retained goal-progress read", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}) => {
  const actor = await actorFactory.create("coach", {
    label: "goal-progress-publication-transition",
  });
  await e2eDatabase.db
    .update(profiles)
    .set({ planning_timezone: "UTC" })
    .where(eq(profiles.id, actor.profileId));
  const athletePage = await actor.createPage("/");
  const title = e2eIdentity.name("Publication transition bike threshold goal");
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
      if (!cardId) throw new Error("The publication-transition goal card did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);
      await evidence.assertReadModels(goalId);

      const transition = await evidence.advancePublication(goalId);
      expect(transition.previousProgress.publication?.publishedRevision).toBe(
        transition.previousPublishedRevision,
      );
      expect(transition.nextOverview.publication.publishedRevision).toBe(
        transition.publishedRevision,
      );
      expect(transition.publishedRevision).toBeGreaterThan(transition.previousPublishedRevision);
      expect(transition.activityId).not.toBe(evidence.activityId);
    },
    { profileId: actor.profileId },
  );
});
