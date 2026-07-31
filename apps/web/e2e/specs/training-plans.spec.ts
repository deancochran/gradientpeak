import { test } from "../fixtures";
import {
  cleanupTrainingPlanByName,
  prepareTrainingPlanPrerequisites,
  withTrainingPlanLibraryFixture,
} from "../training-plans/data";
import {
  createEditAndReloadTrainingPlan,
  createScheduleAndReorderTrainingPlan,
  expectTrainingPlanLibraries,
  saveAndRestoreTrainingPreferences,
  trainingPlanName,
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
  const name = trainingPlanName(testInfo, "Training plan");
  let restorePrerequisites: (() => Promise<void>) | undefined;
  try {
    await cleanupTrainingPlanByName(name);
    restorePrerequisites = await prepareTrainingPlanPrerequisites();
    await createEditAndReloadTrainingPlan(athletePage, testInfo);
  } finally {
    await cleanupTrainingPlanByName(name);
    await restorePrerequisites?.();
  }
});

test("athlete atomically reorders persisted scheduled activities", async ({
  athletePage,
}, testInfo) => {
  const name = trainingPlanName(testInfo, "Reorder training plan");
  let restorePrerequisites: (() => Promise<void>) | undefined;
  try {
    await cleanupTrainingPlanByName(name);
    restorePrerequisites = await prepareTrainingPlanPrerequisites();
    await createScheduleAndReorderTrainingPlan(athletePage, testInfo);
  } finally {
    await cleanupTrainingPlanByName(name);
    await restorePrerequisites?.();
  }
});

test("athlete preferences hydrate, validate, persist, reload, and restore", async ({
  athletePage,
}) => {
  await saveAndRestoreTrainingPreferences(athletePage);
});
