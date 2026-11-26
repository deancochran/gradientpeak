import { activities } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { recordingSubmissionActivityId } from "../recording/indexed-db";

// Execute with the guarded disposable-actor harness.
test("[P0] a nonowner can select, record, and save a public activity plan association", async ({
  athletePage,
  athleteActor,
  coachActor,
  e2eData,
  e2eDatabase,
}) => {
  const profileId = athleteActor.profileId;
  if (!profileId) throw new Error("An owned athlete profile is required");
  expect(profileId).not.toBe(coachActor.profileId);
  const plan = await e2eData.activityPlans.create({
    actorEmail: coachActor.email,
    label: "public-recording-plan",
    visibility: "public",
  });

  await athletePage.goto("/record/session?activity_category=bike&gps=off");
  await athletePage.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(
    athletePage.locator("details").filter({ hasText: "Plan & route setup" }),
  ).toHaveAttribute("open", "");
  const card = athletePage.getByRole("button", { name: plan.name, exact: true });
  await expect(card).toBeEnabled();
  await card.click();
  await athletePage.getByRole("button", { name: "Attach / replace", exact: true }).click();
  await expect(athletePage.getByText(`Current plan: ${plan.name}`, { exact: true })).toBeVisible();
  await athletePage.getByRole("button", { name: "Start", exact: true }).click();
  const pause = athletePage.getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeEnabled();
  await expect(athletePage.getByText("Elapsed", { exact: true }).locator("..")).not.toContainText(
    "00:00:00",
  );
  await pause.click();
  await expect(athletePage.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
  await athletePage.getByRole("button", { name: "Finish", exact: true }).click();
  let activityId: string | null = null;
  try {
    await athletePage.getByRole("button", { name: "Save activity", exact: true }).click();
    const open = athletePage.getByRole("link", { name: "Open saved activity", exact: true });
    await expect(open).toBeVisible({ timeout: 20_000 });
    activityId = await recordingSubmissionActivityId(athletePage);
    if (!activityId) throw new Error("Saved recording must expose its durable activity identity");
    // Registered after the plan, so reverse-order teardown removes the activity first.
    e2eData.activities.register(activityId, profileId);
    await expect(open).toHaveAttribute("href", `/activities/${activityId}`);
    await open.click();
    await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}$`));
    await expect(athletePage.getByRole("heading", { name: "Context", exact: true })).toBeVisible();
    await expect(
      athletePage
        .getByText("Linked activity plan", { exact: true })
        .locator("..")
        .getByText(plan.name, { exact: true }),
    ).toBeVisible();
    expect(
      await e2eDatabase.db
        .select({ planId: activities.activity_plan_id })
        .from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId))),
    ).toEqual([{ planId: plan.id }]);
  } finally {
    activityId ??= await recordingSubmissionActivityId(athletePage);
    if (activityId) {
      e2eData.activities.register(activityId, profileId);
      await deleteImportedActivity(athletePage, activityId);
    }
  }
});
