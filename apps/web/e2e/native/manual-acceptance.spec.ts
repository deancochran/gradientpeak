import { expect, test } from "../fixtures";
import { completeManualNativeAcceptance } from "./current-candidate-support";

test("current Android candidate completes and reopens one manual native activity", async ({
  onboardingActor: actor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const { completedSession, today } = await completeManualNativeAcceptance({
    actor,
    e2eDatabase,
    e2eIdentity,
    testInfo,
  });

  if (!completedSession.completed_activity_id)
    throw new Error("Manual completion did not retain its linked activity ID");
  const web = await actor.createPage(`/activities/${completedSession.completed_activity_id}`);
  await expect(web.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await web.goto(`/calendar/day/${today}`);
  await expect(
    web
      .getByRole("link", { name: /^Open activity / })
      .and(web.locator(`a[href="/activities/${completedSession.completed_activity_id}"]`)),
  ).toHaveCount(1);
  await web.close();
});
