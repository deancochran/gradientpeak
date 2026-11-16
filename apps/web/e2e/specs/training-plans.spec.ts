import type { Route } from "@playwright/test";
import { plannedSessions, trainingPlanApplications, trainingPlans } from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { CalendarPage, TrainingPlansPage } from "../pages";
import { captureAuthoring, createLocalAuthoringPage } from "../pages/authoring";
import { isTrpcProcedure, trpcProcedureCount } from "../pages/network";
import { withLocalE2EDatabase } from "../support/database";
import { registerTrainingPlanCleanup } from "../training-plans/cleanup";
import {
  expectPlanOwnedPreferences,
  prepareTrainingPlanPrerequisites,
  withTrainingPlanLibraryFixture,
} from "../training-plans/data";
import {
  createEditAndReloadTrainingPlan,
  expectTrainingPlanLibraries,
} from "../training-plans/journeys";

test("[authoring-final] current training creation exits fresh and single-flights a delayed preview", async ({
  athleteActor,
  e2eDatabase,
  e2eCleanup,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const athletePage = await createLocalAuthoringPage(athleteActor);
  const name = e2eIdentity.name("Final training creation");
  let restore: (() => Promise<void>) | undefined;
  let release = () => {};
  let holdingPreview = true;
  const gate = new Promise<void>((resolve) => {
    release = () => {
      holdingPreview = false;
      resolve();
    };
  });
  const matcher = (url: URL) => isTrpcProcedure(url, "trainingPlans.preview");
  let previewCalls = 0;
  let commitCalls = 0;
  const delay = async (route: Route) => {
    if (holdingPreview) {
      previewCalls += trpcProcedureCount(new URL(route.request().url()), "trainingPlans.preview");
      await gate;
    }
    await route.fallback();
  };
  const matching = () =>
    e2eDatabase.db
      .select({
        id: trainingPlans.id,
        name: trainingPlans.name,
        description: trainingPlans.description,
      })
      .from(trainingPlans)
      .where(
        and(eq(trainingPlans.profile_id, athleteActor.profileId), eq(trainingPlans.name, name)),
      );
  try {
    restore = await prepareTrainingPlanPrerequisites(athleteActor);
    const plans = new TrainingPlansPage(athletePage);
    await plans.openLibrary();
    await plans.startCreate();
    await athletePage.getByLabel("Name", { exact: true }).fill("Discard on Cancel");
    await athletePage.getByRole("button", { name: "Cancel changes", exact: true }).click();
    await expect(athletePage).not.toHaveURL(/\/training-plans\/create$/);
    await plans.openLibrary();
    await plans.startCreate();
    await expect(athletePage.getByLabel("Name", { exact: true })).toHaveValue("");
    await athletePage.getByLabel("Name", { exact: true }).fill("Discard on Back");
    await athletePage.goBack();
    await expect(athletePage).toHaveURL(/\/training-plans\/?$/);
    await expect(athletePage.getByTestId("training-plan-create")).toBeVisible();
    await plans.openLibrary();
    await plans.startCreate();
    await expect(athletePage.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(athletePage.getByText(/resume draft|restore draft/i)).toHaveCount(0);
    await athletePage.getByLabel("Name", { exact: true }).fill(name);
    await athletePage
      .getByLabel("Description", { exact: true })
      .fill("Current editor browser proof.");
    await athletePage.getByRole("button", { name: "Add activity", exact: true }).click();
    await athletePage
      .getByRole("combobox", { name: "Activity plan", exact: true })
      .selectOption({ label: "Playwright Tempo Builder" });
    const form = athletePage
      .locator("form")
      .filter({ has: athletePage.getByLabel("Name", { exact: true }) });
    const save = form.locator('button[type="submit"]');
    await expect(save).toBeEnabled({ timeout: 30_000 });
    // Exercise a real preflight fetch rather than QueryClient's fresh cached preview.
    // Date advances beyond the five-minute cache; browser timers continue normally.
    await athletePage.clock.setFixedTime(new Date(Date.now() + 6 * 60_000));
    await athletePage.route(matcher, delay);
    athletePage.on("request", (request) => {
      commitCalls += trpcProcedureCount(new URL(request.url()), "trainingPlans.commit");
    });
    await form.evaluate((element) => {
      if (!(element instanceof HTMLFormElement))
        throw new Error("Expected the current training editor form.");
      element.requestSubmit();
      element.requestSubmit();
    });
    await expect.poll(() => previewCalls).toBe(1);
    await expect(save).toBeDisabled();
    await expect(athletePage.getByLabel("Name", { exact: true })).toBeDisabled();
    expect(commitCalls).toBe(0);
    await save.scrollIntoViewIfNeeded();
    await captureAuthoring(athletePage, testInfo, "training-delayed-preview", [save]);
    release();
    await expect(athletePage).toHaveURL(/\/training-plans\/[0-9a-f-]+$/i, { timeout: 30_000 });
    expect(previewCalls).toBe(1);
    expect(commitCalls).toBe(1);
    await expect.poll(async () => (await matching()).length).toBe(1);
    await expect(athletePage.getByRole("heading", { name, exact: true })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name, exact: true })).toBeVisible();
    await athletePage.getByRole("button", { name: "Edit plan", exact: true }).click();
    await expect(
      athletePage.getByRole("heading", { name: "Edit training plan", exact: true }),
    ).toBeVisible();
    await athletePage
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Current editor metadata edit.");
    await athletePage.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(athletePage.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect
      .poll(async () => (await matching())[0]?.description)
      .toBe("Current editor metadata edit.");
  } finally {
    release();
    await athletePage.unroute(matcher, delay).catch((error: unknown) => {
      if (!athletePage.isClosed()) throw error;
    });
    for (const plan of await matching())
      registerTrainingPlanCleanup(e2eCleanup, {
        id: plan.id,
        ownerProfileId: athleteActor.profileId,
        scheduledByProfileId: athleteActor.profileId,
        systemTemplate: false,
      });
    await restore?.();
  }
});

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
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.scheduledActivityPlanName}`,
      }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.scheduledActivityPlanName}`,
      }),
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
      athletePage.getByRole("link", {
        name: `Open planned activity ${fixture.scheduledActivityPlanName}`,
      }),
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
