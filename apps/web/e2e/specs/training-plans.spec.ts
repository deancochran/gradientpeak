import { expect, test } from "../fixtures";
import { CalendarPage, TrainingPlansPage } from "../pages";
import {
  prepareTrainingPlanPrerequisites,
  withTrainingPlanLibraryFixture,
} from "../training-plans/data";
import {
  createEditAndReloadTrainingPlan,
  expectTrainingPlanLibraries,
  saveAndRestoreTrainingPreferences,
} from "../training-plans/journeys";

test("athlete can browse persisted owned and template training-plan libraries", async ({
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async (fixture) => {
    await expectTrainingPlanLibraries(athletePage, fixture);
  });
});

test("athlete creates, reloads, edits, and cleans a persisted training plan", async ({
  athletePage,
}, testInfo) => {
  let restorePrerequisites: (() => Promise<void>) | undefined;
  try {
    restorePrerequisites = await prepareTrainingPlanPrerequisites();
    await createEditAndReloadTrainingPlan(athletePage, testInfo);
  } finally {
    await restorePrerequisites?.();
  }
});

test("athlete preferences hydrate, validate, persist, reload, and restore", async ({
  athletePage,
}) => {
  await saveAndRestoreTrainingPreferences(athletePage);
});

test("[P1] athlete applies a training plan to the calendar and removes the persisted schedule", async ({
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async (fixture) => {
    const startDate = "2026-12-07";
    const plans = new TrainingPlansPage(athletePage);
    const calendar = new CalendarPage(athletePage);
    await plans.openLibrary();
    await plans.openPlan(fixture.ownedName);
    const planUrl = athletePage.url();

    await plans.applyToSchedule(startDate);
    await expect(athletePage.getByText("Plan scheduled.", { exact: true })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Remove schedule" })).toBeVisible();

    await calendar.openDay(startDate, { month: "2026-12", view: "agenda" });
    await expect(
      athletePage.getByRole("link", { name: `Open planned activity Playwright Tempo Builder` }),
    ).toBeVisible();
    await athletePage.reload();
    await expect(
      athletePage.getByRole("link", { name: `Open planned activity Playwright Tempo Builder` }),
    ).toBeVisible();

    await athletePage.goto(planUrl);
    await expect(athletePage.getByRole("heading", { name: fixture.ownedName })).toBeVisible();
    await plans.removeSchedule();
    await expect(
      athletePage.getByText("Scheduled activities removed.", { exact: true }),
    ).toBeVisible();

    await calendar.openDay(startDate, { month: "2026-12", view: "agenda" });
    await expect(
      athletePage.getByRole("link", { name: `Open planned activity Playwright Tempo Builder` }),
    ).toHaveCount(0);
  });
});
