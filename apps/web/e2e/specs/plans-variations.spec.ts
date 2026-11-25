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
  const cycling = athletePage.getByRole("button", { name: /^cycling$/i });
  await cycling.click();
  await expect(cycling).toHaveAttribute("aria-pressed", "true");
  await expect(athletePage).toHaveURL(/activity_category=bike/);
  const search = plans.searchInput();
  await search.fill("Tempo Builder");
  const plan = plans.card(/playwright tempo builder/i);
  await expect(plan).toBeVisible();
  await plan.click();
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder/i }),
  ).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-session-flow")).toBeVisible();
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
      await expect(athletePage.getByRole("heading", { name: defaultName })).toBeVisible();
      await athletePage.getByRole("button", { name: /^edit$/i }).click();
      await athletePage.getByLabel("Plan name").fill("Abandoned duplicate rename");
      await athletePage.goBack();
      await expect(athletePage.getByRole("heading", { name: defaultName })).toBeVisible();
      await expect(
        athletePage.getByRole("heading", { name: "Abandoned duplicate rename" }),
      ).toHaveCount(0);
      await athletePage.reload();
      await expect(athletePage.getByRole("heading", { name: defaultName })).toBeVisible();
      await athletePage.goto(sharedActivityPlanUrl());
      await expect(
        athletePage.getByRole("heading", { name: "Playwright Tempo Builder" }),
      ).toBeVisible();
    },
  );
});

test("[variation:activity-plans.duplicate:source-history] returning from a duplicate retains a searchable unchanged source plan", async ({
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
      await athletePage.goto(sharedActivityPlanUrl());
      await expect(
        athletePage.getByRole("heading", { name: "Playwright Tempo Builder" }),
      ).toBeVisible();
      await plans.openLibrary();
      await plans.search("Tempo Builder");
      await athletePage
        .getByRole("button", { name: "Open activity plan Playwright Tempo Builder", exact: true })
        .click();
      await expect(athletePage.getByText("Owner", { exact: true })).toBeVisible();
      await expect(athletePage.getByTestId("activity-plan-session-flow")).toBeVisible();
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
      const sessionFlow = athletePage.getByTestId("activity-plan-session-flow");
      await expect(sessionFlow).toBeVisible();
      await expect(sessionFlow.getByTestId("activity-plan-session-flow-timeline")).toBeVisible();
      await expect(athletePage.getByTestId("activity-plan-estimates")).toBeVisible();
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
      await plans.create({ name, category: "bike", firstStep: "Dependency ride" });
      await plans.schedule("2026-09-14");
      await athletePage.getByRole("button", { name: /^delete$/i }).click();
      await expect(athletePage.getByText(/including 1 scheduled session/i)).toBeVisible();
      await athletePage.keyboard.press("Escape");
      await expect(athletePage.getByRole("heading", { name })).toBeVisible();
      await athletePage.getByRole("button", { name: /remove from schedule/i }).click();
      await expect(athletePage.getByRole("button", { name: /^schedule$/i })).toBeVisible();
    },
  );
});

test("[variation:activity-plans.author:required-inputs] creation remains gated until required metadata and composition are supplied", async ({
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
      await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
      await athletePage.getByLabel("Plan name").fill(name);
      await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
      await athletePage.getByLabel("Activity category").selectOption("bike");
      await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
      await expect(
        athletePage.getByRole("button", { name: "Add step", exact: true }),
      ).toBeEnabled();
      await athletePage.getByRole("button", { name: "Add step", exact: true }).click();
      const step = athletePage.locator('[id^="activity-plan-step-"]').first();
      await step.getByLabel("Completion").selectOption("time");
      await step.getByLabel("Quantity").fill("600");
      await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeEnabled();
    },
  );
});

test("[variation:activity-plans.author:narrow-controls] narrow composer retains focusable current composition controls", async ({
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
      await athletePage.getByLabel("Activity category").selectOption("bike");
      const addStep = athletePage.getByRole("button", { name: "Add step", exact: true });
      await addStep.scrollIntoViewIfNeeded();
      await addStep.focus();
      await expect(addStep).toBeFocused();
      await addStep.press("Enter");
      await expect(
        athletePage.getByRole("button", { name: "Close editor for step 1" }),
      ).toBeVisible();
    },
  );
});

test("[variation:training-plans.library:owned-detail-back] owned search opens detail and browser back restores the owned result", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
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
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
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
  athleteActor,
  athletePage,
}, testInfo) => {
  const name = trainingPlanName(testInfo, "Training plan");
  let restore: (() => Promise<void>) | undefined;
  try {
    restore = await prepareTrainingPlanPrerequisites(athleteActor);
    await createEditAndReloadTrainingPlan(athletePage, testInfo, athleteActor.profileId);
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
  athleteActor,
  athletePage,
}, testInfo) => {
  let restore: (() => Promise<void>) | undefined;
  try {
    restore = await prepareTrainingPlanPrerequisites(athleteActor);
    await createEditAndReloadTrainingPlan(athletePage, testInfo, athleteActor.profileId);
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

test("[variation:settings:unsaved-reload] unsaved units edits are discarded by reload", async ({
  athletePage,
}) => {
  await athletePage.goto("/settings");
  const units = athletePage.getByLabel("Preferred units");
  const originalUnits = await units.inputValue();
  await units.selectOption(originalUnits === "metric" ? "imperial" : "metric");
  await athletePage.reload();
  await expect(units).toHaveValue(originalUnits);
});

test("[variation:training-plans.schedule:agenda-back] scheduled activity opens its plan and returns to the retained day agenda", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withTrainingPlanLibraryFixture(testInfo, athleteActor, async (fixture) => {
    const plans = new TrainingPlansPage(athletePage);
    const calendar = new CalendarPage(athletePage);
    await plans.openLibrary();
    await plans.openPlan(fixture.ownedName);
    await plans.reviewSchedule("2026-12-21");
    await plans.confirmSchedule();
    await calendar.openDay("2026-12-21", { month: "2026-12", view: "agenda" });
    const planned = athletePage.getByRole("link", {
      name: `Open planned activity ${fixture.scheduledActivityPlanName}`,
    });
    await planned.click();
    await expect(
      athletePage.getByRole("heading", { name: fixture.scheduledActivityPlanName }),
    ).toBeVisible();
    await athletePage.goBack();
    await expect(planned).toBeVisible();
    await expect(athletePage).toHaveURL(/calendar\/day\/2026-12-21/);
  });
});
