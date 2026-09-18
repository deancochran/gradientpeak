import { plannedSessions, trainingPlanApplications } from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { CalendarPage, TrainingPlansPage } from "../pages";
import { withLocalE2EDatabase } from "../support/database";
import {
  expectPlanOwnedPreferences,
  prepareTrainingPlanPrerequisites,
  withTrainingPlanLibraryFixture,
} from "../training-plans/data";
import {
  createEditAndReloadTrainingPlan,
  expectTrainingPlanLibraries,
} from "../training-plans/journeys";

test("athlete can browse persisted owned and template training-plan libraries", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
    await expectTrainingPlanLibraries(athletePage, fixture);
  });
});

test("athlete creates, reloads, edits, and cleans a persisted training plan", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  let restorePrerequisites: (() => Promise<void>) | undefined;
  try {
    restorePrerequisites = await prepareTrainingPlanPrerequisites(athleteActor);
    await createEditAndReloadTrainingPlan(athletePage, testInfo, athleteActor.profileId);
  } finally {
    await restorePrerequisites?.();
  }
});

test("training-plan library preserves plan-owned preferences", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
    const plans = new TrainingPlansPage(athletePage);
    await plans.openLibrary();
    await plans.openPlan(fixture.ownedName);
    await expectPlanOwnedPreferences(fixture.ownedId);
  });
});

test("[P1] athlete applies a training plan to the calendar and removes the persisted schedule", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
    const startDate = "2026-12-07";
    const plans = new TrainingPlansPage(athletePage);
    const calendar = new CalendarPage(athletePage);
    await plans.openLibrary();
    await plans.openPlan(fixture.ownedName);
    const planUrl = athletePage.url();

    await plans.reviewSchedule(startDate);
    await withLocalE2EDatabase(async (database) => {
      const pending = await database.typedTransaction((transaction) =>
        transaction
          .select({ id: trainingPlanApplications.id })
          .from(trainingPlanApplications)
          .where(
            and(
              eq(trainingPlanApplications.training_plan_id, fixture.ownedId),
              eq(trainingPlanApplications.profile_id, athleteActor.profileId),
            ),
          ),
      );
      expect(pending).toHaveLength(0);
    });
    await plans.confirmSchedule();
    await expect(athletePage.getByText("Plan scheduled.", { exact: true })).toBeVisible();

    await calendar.openDay(startDate, { month: "2026-12", view: "agenda" });
    await expect(
      athletePage.getByRole("link", { name: "Open planned activity bike session" }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(
      athletePage.getByRole("link", { name: "Open planned activity bike session" }),
    ).toBeVisible();

    await athletePage.goto(planUrl);
    await expect(athletePage.getByRole("heading", { name: fixture.ownedName })).toBeVisible();
    const application = await withLocalE2EDatabase(async (database) => {
      const [result] = await database.typedTransaction((transaction) =>
        transaction
          .select({ id: trainingPlanApplications.id })
          .from(trainingPlanApplications)
          .where(
            and(
              eq(trainingPlanApplications.training_plan_id, fixture.ownedId),
              eq(trainingPlanApplications.profile_id, athleteActor.profileId),
            ),
          )
          .orderBy(desc(trainingPlanApplications.created_at))
          .limit(1),
      );
      return result?.id;
    });
    if (!application) throw new Error("Scheduled training-plan application was not persisted.");
    await plans.selectScheduleApplication(application);
    await plans.reviewScheduleRemoval();
    await withLocalE2EDatabase(async (database) => {
      const scheduled = await database.typedTransaction((transaction) =>
        transaction
          .select({ id: plannedSessions.id })
          .from(plannedSessions)
          .where(
            and(
              eq(plannedSessions.training_plan_application_id, application),
              eq(plannedSessions.profile_id, athleteActor.profileId),
              eq(plannedSessions.status, "scheduled"),
            ),
          ),
      );
      expect(scheduled).toHaveLength(1);
    });
    await plans.confirmScheduleRemoval();
    await expect(
      athletePage.getByText("Scheduled activities removed.", { exact: true }),
    ).toBeVisible();

    await calendar.openDay(startDate, { month: "2026-12", view: "agenda" });
    await expect(
      athletePage.getByRole("link", { name: "Open planned activity bike session" }),
    ).toHaveText(/Cancelled/);
    await withLocalE2EDatabase(async (database) => {
      const scheduled = await database.typedTransaction((transaction) =>
        transaction
          .select({ id: plannedSessions.id })
          .from(plannedSessions)
          .where(
            and(
              eq(plannedSessions.training_plan_application_id, application),
              eq(plannedSessions.profile_id, athleteActor.profileId),
              eq(plannedSessions.status, "scheduled"),
            ),
          ),
      );
      expect(scheduled).toHaveLength(0);
    });
  });
});
