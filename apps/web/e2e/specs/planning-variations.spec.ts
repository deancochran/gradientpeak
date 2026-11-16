import {
  activities,
  activitySegments,
  manualTrainingDiaryOperations,
  plannedSessions,
  profiles,
} from "@repo/db/schema";
import { and, eq, gt, isNotNull, isNull, ne, or } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withDayAgendaFixture } from "../planning/day-agenda";
import { createDirectPlannedSessionFixture } from "../planning/planned-session";
import { LocalE2EDatabase } from "../support/database";
import { withTrainingPlanLibraryFixture } from "../training-plans/data";

test("[variation:agenda-detail] planned and completed cards open and return to the selected day", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  // The round trip has two server-backed detail loads and exceeds the shared
  // 30s default on a cold disposable backend while remaining deterministic.
  test.setTimeout(45_000);
  await withDayAgendaFixture(testInfo, athleteActor, async (fixture) => {
    await athletePage.goto(`/calendar/day/${fixture.date}?month=2026-11&view=agenda`);
    const planned = athletePage.getByRole("link", {
      name: `Open planned activity ${fixture.plannedAgendaTitle}`,
    });
    await planned.scrollIntoViewIfNeeded();
    await planned.click();
    await expect(athletePage).toHaveURL(
      (url) => url.pathname === `/calendar/events/${fixture.eventId}`,
    );
    await expect(
      athletePage.getByRole("heading", { name: fixture.plannedPlanName, exact: true }),
    ).toBeVisible();
    await athletePage.goBack();
    const completed = athletePage.getByTestId(`activity-card-${fixture.activityId}`);
    await completed.scrollIntoViewIfNeeded();
    await completed.getByTestId(`activity-card-${fixture.activityId}-open`).click();
    const detailCard = athletePage.getByTestId(`activity-card-${fixture.activityId}`);
    await expect(athletePage.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
    await expect(
      detailCard.getByRole("heading", { name: fixture.completedName, exact: true }),
    ).toBeVisible();
    await athletePage.goBack();
    await expect(athletePage).toHaveURL((url) => url.pathname === `/calendar/day/${fixture.date}`);
    await expect(athletePage).toHaveURL(
      (url) =>
        new URLSearchParams([...url.searchParams].sort()).toString() ===
        "month=2026-11&view=agenda",
    );
    await expect(planned).toBeVisible();
    await expect(
      completed.getByRole("heading", { name: fixture.completedName, exact: true }),
    ).toBeVisible();
  });
});

test("[variation:training-plan-keyboard] searched plan opens, schedules, and returns from agenda", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
    await athletePage.goto("/training-plans");
    const search = athletePage.getByLabel("Search plans");
    await search.fill(fixture.ownedName);
    await search.press("Enter");
    const card = athletePage
      .getByTestId(/^training-plan-card-/)
      .filter({ hasText: fixture.ownedName });
    const open = card.getByRole("button", { name: "View plan" });
    await open.focus();
    await open.press("Enter");
    await athletePage.getByLabel("Start date").fill("2026-12-14");
    await athletePage.getByRole("button", { name: "Review schedule" }).press("Enter");
    await athletePage.getByRole("button", { name: "Confirm schedule" }).press("Enter");
    await expect(athletePage.getByText("Plan scheduled.", { exact: true })).toBeVisible();
    await athletePage.goto("/calendar/day/2026-12-14?month=2026-12&view=agenda");
    await expect(
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.scheduledActivityPlanName}`,
      }),
    ).toBeVisible();
  });
});

test("manual completion can be associated with a recorded activity", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eIdentity,
}) => {
  const planningDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const operationId = e2eIdentity.suffix("manual-completion-session", 32);
  const recorded = await e2eData.activities.create({
    actorEmail: athleteActor.email,
    date: planningDate,
    label: "manual-completion-recorded",
  });
  const database = new LocalE2EDatabase();
  const previousTimezone = await database.typedTransaction(async (transaction) => {
    const [profile] = await transaction
      .select({ planningTimezone: profiles.planning_timezone })
      .from(profiles)
      .where(eq(profiles.id, athleteActor.profileId))
      .limit(1);
    await transaction
      .update(profiles)
      .set({ planning_timezone: "UTC" })
      .where(eq(profiles.id, athleteActor.profileId));
    return profile?.planningTimezone ?? null;
  });
  const candidate = await database.typedTransaction((transaction) =>
    transaction
      .selectDistinct({ id: activities.id })
      .from(activities)
      .innerJoin(
        activitySegments,
        and(
          eq(activitySegments.activity_id, activities.id),
          eq(activitySegments.profile_id, activities.profile_id),
        ),
      )
      .where(
        and(
          eq(activities.id, recorded.id),
          eq(activities.profile_id, athleteActor.profileId),
          or(isNull(activities.entry_provenance), ne(activities.entry_provenance, "manual")),
          isNull(activities.superseded_by_activity_id),
          isNotNull(activities.started_at),
          gt(activities.elapsed_ms, 0),
          eq(activitySegments.activity_category, "bike"),
        ),
      ),
  );
  expect(candidate).toHaveLength(1);
  let sessionId: string | undefined;
  try {
    // This is an association/completion boundary test, not a scheduling journey.
    // Keep the plan and direct session as named, isolated prerequisites so this
    // test does not imply that its setup exercises the schedule UI.
    sessionId = await createDirectPlannedSessionFixture({
      actor: athleteActor,
      operationId,
      planningDate,
    });
    await athletePage.goto(
      `/calendar/events/${sessionId}?resourceType=planned_session&month=${planningDate.slice(0, 7)}&view=agenda`,
    );
    await expect(athletePage.getByRole("button", { name: "Complete activity" })).toBeVisible();
    await athletePage.getByRole("button", { name: "Complete activity" }).click();
    await expect(
      athletePage.getByRole("link", { name: "View linked completed activity" }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: "Associate recorded activity" }).click();
    await athletePage.getByText(recorded.name, { exact: true }).click();
    const associationResponse = athletePage.waitForResponse((response) =>
      response.url().includes("plannedSessions.linkCompletion"),
    );
    await athletePage.getByRole("button", { name: "Confirm association" }).click();
    const associationBody = await (await associationResponse).text();
    expect(associationBody).not.toContain('"error"');
    const plannedSessionId = sessionId;
    if (!plannedSessionId) throw new Error("The planned session fixture was not created.");
    const reconciled = await database.typedTransaction((transaction) =>
      transaction
        .select({
          completed_activity_id: plannedSessions.completed_activity_id,
          superseded_by_activity_id: activities.superseded_by_activity_id,
        })
        .from(plannedSessions)
        .leftJoin(activities, eq(activities.reconciled_planned_session_id, plannedSessions.id))
        .where(
          and(
            eq(plannedSessions.id, plannedSessionId),
            eq(plannedSessions.profile_id, athleteActor.profileId),
          ),
        ),
    );
    expect(reconciled).toEqual([
      { completed_activity_id: recorded.id, superseded_by_activity_id: recorded.id },
    ]);
    await athletePage.reload();
    await expect(
      athletePage.getByRole("link", { name: "View linked completed activity" }),
    ).toHaveAttribute("href", recorded.url);
  } finally {
    try {
      await database.typedTransaction(async (transaction) => {
        if (sessionId) {
          await transaction
            .delete(manualTrainingDiaryOperations)
            .where(
              and(
                eq(manualTrainingDiaryOperations.planned_session_id, sessionId),
                eq(manualTrainingDiaryOperations.profile_id, athleteActor.profileId),
              ),
            );
          await transaction
            .delete(activities)
            .where(
              and(
                eq(activities.reconciled_planned_session_id, sessionId),
                eq(activities.profile_id, athleteActor.profileId),
              ),
            );
          await transaction
            .delete(plannedSessions)
            .where(
              and(
                eq(plannedSessions.id, sessionId),
                eq(plannedSessions.profile_id, athleteActor.profileId),
              ),
            );
        }
        await transaction
          .update(profiles)
          .set({ planning_timezone: previousTimezone })
          .where(eq(profiles.id, athleteActor.profileId));
      });
    } finally {
      await database.close();
    }
  }
});
