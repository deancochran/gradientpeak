import { expect, test } from "../fixtures";
import { ActivityPlansPage, CalendarPage, TrainingPlansPage } from "../pages";
import { currentE2EActor } from "../support/actors";
import {
  prepareTrainingPlanPrerequisites,
  withTrainingPlanLibraryFixture,
} from "../training-plans/data";
import { createEditAndReloadTrainingPlan, trainingPlanName } from "../training-plans/journeys";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  runWithE2ECleanup,
} from "../utils/testData";

function sharedActivityPlanUrl() {
  return `/activity-plans/${currentE2EActor("athlete").activityPlanId}`;
}

test("[variation:activity-plans.library:narrow-card] category filtering scrolls to and opens the named plan detail", async ({
  athletePage,
}) => {
  const plans = new ActivityPlansPage(athletePage);
  await athletePage.setViewportSize({ width: 390, height: 844 });
  await plans.openLibrary();
  await athletePage.getByRole("button", { name: /^all$/i }).click();
  const search = plans.searchInput();
  await search.fill("Tempo Builder");
  const plan = plans.card(/playwright tempo builder/i);
  await plan.scrollIntoViewIfNeeded();
  await plan.click();
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder/i }),
  ).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-structure")).toContainText("Tempo");
});

test("[variation:activity-plans.library:keyboard-history] keyboard search opens structure and browser back retains the query", async ({
  athletePage,
}) => {
  const plans = new ActivityPlansPage(athletePage);
  await plans.openLibrary();
  const search = plans.searchInput();
  await search.fill("Playwright Tempo Builder");
  await search.press("Enter");
  const plan = plans.card(/playwright tempo builder/i);
  await plan.focus();
  await plan.press("Enter");
  await expect(athletePage.getByText("Bring bottles")).toBeVisible();
  await athletePage.goBack();
  await expect(search).toHaveValue("Playwright Tempo Builder");
  await expect(plan).toBeVisible();
});

test("[variation:activity-plans.duplicate:cancel-edit] duplicate edit changes are abandoned without changing the owned copy", async ({
  athletePage,
}, testInfo) => {
  const defaultName = "Playwright Tempo Builder (Copy)";
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedActivityPlans({ planNames: [defaultName] }),
    async () => {
      const plans = new ActivityPlansPage(athletePage);
      await athletePage.goto(sharedActivityPlanUrl());
      await plans.duplicate();
      await athletePage.getByRole("button", { name: /^edit$/i }).click();
      await athletePage.getByLabel("Plan name").fill("Abandoned duplicate rename");
      await athletePage.goBack();
      await expect(athletePage.getByRole("heading", { name: defaultName })).toBeVisible();
      await athletePage.reload();
      await expect(athletePage.getByRole("heading", { name: defaultName })).toBeVisible();
    },
  );
});

test("[variation:activity-plans.duplicate:source-history] deleting a duplicate returns to a searchable unchanged source plan", async ({
  athletePage,
}, testInfo) => {
  const defaultName = "Playwright Tempo Builder (Copy)";
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedActivityPlans({ planNames: [defaultName] }),
    async () => {
      const plans = new ActivityPlansPage(athletePage);
      await athletePage.goto(sharedActivityPlanUrl());
      await plans.duplicate();
      await athletePage.getByRole("button", { name: /^delete$/i }).click();
      await athletePage.getByRole("button", { name: /^delete plan$/i }).click();
      await plans.search("Tempo Builder");
      await plans.openPlan(/playwright tempo builder/i);
      await expect(athletePage.getByText("Owner", { exact: true })).toBeVisible();
      await expect(athletePage.getByText("Tempo", { exact: true })).toBeVisible();
    },
  );
});

test("[variation:activity-plans.author:save-reopen] a minimal bike plan is created with the keyboard and reopens from filtered library results", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "keyboard authored activity plan");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedActivityPlans({ planNames: [name] }),
    async () => {
      const plans = new ActivityPlansPage(athletePage);
      await plans.create({
        name,
        description: "Keyboard-authored browser variation",
        category: "bike",
        firstStep: "Steady ride",
        submit: "keyboard",
      });
      await plans.openLibrary();
      await plans.search(name);
      await plans.openPlan(name);
      await expect(athletePage.getByText("Steady ride", { exact: true })).toBeVisible();
    },
  );
});

test("[variation:activity-plans.author:schedule-cancel-delete] scheduled dependency blocks ordinary deletion until the schedule is removed", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "dependency variation plan");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedActivityPlans({ planNames: [name] }),
    async () => {
      const plans = new ActivityPlansPage(athletePage);
      await plans.create({ name });
      await plans.schedule("2026-09-14");
      await athletePage.getByRole("button", { name: /^delete$/i }).click();
      await expect(athletePage.getByText(/has 1 scheduled session/i)).toBeVisible();
      await athletePage.keyboard.press("Escape");
      await expect(athletePage.getByRole("heading", { name })).toBeVisible();
      await athletePage.getByRole("button", { name: /remove from schedule/i }).click();
      await expect(athletePage.getByRole("button", { name: /^schedule$/i })).toBeVisible();
    },
  );
});

test("[variation:activity-plans.structure-retry:repeated-correction] deleting and restoring structure twice keeps creation gated until valid", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "repeated structure correction");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedActivityPlans({ planNames: [name] }),
    async () => {
      const plans = new ActivityPlansPage(athletePage);
      await plans.openLibrary();
      await plans.startCreate();
      await athletePage.getByLabel("Plan name").fill(name);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await athletePage.getByRole("button", { name: "Delete segment" }).click();
        await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
        await athletePage.getByRole("button", { name: "Activity" }).click();
        await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeEnabled();
      }
      await athletePage.getByRole("button", { name: "Create plan" }).click();
      await expect(athletePage.getByTestId("activity-plan-structure")).toContainText("Activity");
    },
  );
});

test("[variation:activity-plans.structure-retry:narrow-focus] narrow structure error retains focusable recovery controls and saves the repaired plan", async ({
  athletePage,
}, testInfo) => {
  const name = e2eArtifactIdentity(testInfo, "narrow repaired structure");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedActivityPlans({ planNames: [name] }),
    async () => {
      const plans = new ActivityPlansPage(athletePage);
      await athletePage.setViewportSize({ width: 390, height: 844 });
      await plans.openLibrary();
      await plans.startCreate();
      await athletePage.getByLabel("Plan name").fill(name);
      await athletePage.getByRole("button", { name: "Delete segment" }).press("Enter");
      const recovery = athletePage.getByRole("button", { name: "Activity" });
      await recovery.scrollIntoViewIfNeeded();
      await recovery.focus();
      await expect(recovery).toBeFocused();
      await recovery.press("Enter");
      await athletePage.getByRole("button", { name: "Create plan" }).press("Enter");
      await expect(athletePage.getByRole("heading", { name })).toBeVisible();
    },
  );
});

test("[variation:training-plans.library:owned-detail-back] owned search opens detail and browser back restores the owned result", async ({
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async (fixture) => {
    const plans = new TrainingPlansPage(athletePage);
    await plans.openLibrary();
    const search = plans.searchInput();
    const card = await plans.search(fixture.ownedName);
    await plans.openPlan(fixture.ownedName);
    await expect(athletePage.getByText("Owned browser-library fixture")).toBeVisible();
    await athletePage.goBack();
    await expect(search).toHaveValue(fixture.ownedName);
    await expect(card).toBeVisible();
  });
});

test("[variation:training-plans.library:narrow-template] narrow template tab scrolls to and opens the exact template card", async ({
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async (fixture) => {
    const plans = new TrainingPlansPage(athletePage);
    await athletePage.setViewportSize({ width: 390, height: 844 });
    await plans.openLibrary();
    await plans.openTemplates();
    await plans.openPlan(fixture.templateName, "keyboard");
    await expect(athletePage.getByRole("heading", { name: fixture.templateName })).toBeVisible();
    await expect(athletePage.getByText("System browser-library fixture")).toBeVisible();
  });
});

test("[variation:training-plans.lifecycle:detail-history] created plan detail survives reload and back-forward navigation", async ({
  athletePage,
}, testInfo) => {
  const name = trainingPlanName(testInfo, "Training plan");
  let restore: (() => Promise<void>) | undefined;
  try {
    restore = await prepareTrainingPlanPrerequisites();
    await createEditAndReloadTrainingPlan(athletePage, testInfo);
    const plans = new TrainingPlansPage(athletePage);
    await plans.openLibrary();
    await plans.openPlan(name);
    await athletePage.goBack();
    await expect(athletePage.getByLabel("Search plans")).toHaveValue(name);
    await athletePage.goForward();
    await expect(
      athletePage.getByText("Edited persisted browser journey description."),
    ).toBeVisible();
  } finally {
    await restore?.();
  }
});

test("[variation:training-plans.lifecycle:cancel-edit] browser back abandons an unsaved description while the persisted edit remains", async ({
  athletePage,
}, testInfo) => {
  let restore: (() => Promise<void>) | undefined;
  try {
    restore = await prepareTrainingPlanPrerequisites();
    await createEditAndReloadTrainingPlan(athletePage, testInfo);
    await athletePage.getByRole("button", { name: "Edit" }).click();
    await athletePage.getByLabel("Description").fill("Unsaved description variation");
    await athletePage.goBack();
    await expect(
      athletePage.getByText("Edited persisted browser journey description."),
    ).toBeVisible();
    await expect(athletePage.getByText("Unsaved description variation")).toHaveCount(0);
  } finally {
    await restore?.();
  }
});

test("[variation:training-preferences:unsaved-reload] invalid schedule edits are discarded by reload without changing persisted values", async ({
  athletePage,
}) => {
  await athletePage.goto("/training-preferences");
  await athletePage.getByRole("button", { name: "Schedule" }).click();
  const min = athletePage.getByTestId("training-preferences-min-sessions-per-week");
  const max = athletePage.getByTestId("training-preferences-max-sessions-per-week");
  const originalMin = await min.inputValue();
  const originalMax = await max.inputValue();
  await min.fill("6");
  await max.fill("1");
  await athletePage.reload();
  await athletePage.getByRole("button", { name: "Schedule" }).click();
  await expect(min).toHaveValue(originalMin);
  await expect(max).toHaveValue(originalMax);
});

test("[variation:training-preferences:keyboard-restore] keyboard save persists a valid range and restores the original range", async ({
  athletePage,
}) => {
  await athletePage.goto("/training-preferences");
  await athletePage.getByRole("button", { name: "Schedule" }).press("Enter");
  const min = athletePage.getByTestId("training-preferences-min-sessions-per-week");
  const max = athletePage.getByTestId("training-preferences-max-sessions-per-week");
  const originalMin = await min.inputValue();
  const originalMax = await max.inputValue();
  try {
    await min.fill("1");
    await max.fill("4");
    await athletePage.getByRole("button", { name: "Save preferences" }).press("Enter");
    await expect(athletePage.getByText("Training preferences saved.")).toBeVisible();
    await athletePage.reload();
    await athletePage.getByRole("button", { name: "Schedule" }).click();
    await expect(min).toHaveValue("1");
    await expect(max).toHaveValue("4");
  } finally {
    await min.fill(originalMin);
    await max.fill(originalMax);
    await athletePage.getByRole("button", { name: "Save preferences" }).click();
    await expect(athletePage.getByText("Training preferences saved.")).toBeVisible();
  }
});

test("[variation:training-plans.schedule:agenda-back] scheduled activity opens its plan and returns to the retained day agenda", async ({
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, async (fixture) => {
    const plans = new TrainingPlansPage(athletePage);
    const calendar = new CalendarPage(athletePage);
    await plans.openLibrary();
    await plans.openPlan(fixture.ownedName);
    await plans.applyToSchedule("2026-12-21");
    await calendar.openDay("2026-12-21", { month: "2026-12", view: "agenda" });
    const planned = athletePage.getByRole("link", {
      name: "Open planned activity Playwright Tempo Builder",
    });
    await planned.click();
    await expect(athletePage.getByRole("heading", { name: "Playwright tempo" })).toBeVisible();
    await athletePage.goBack();
    await expect(planned).toBeVisible();
    await expect(athletePage).toHaveURL(/calendar\/day\/2026-12-21/);
  });
});
