import { expect, test } from "../fixtures";
import { ActivityPlansPage, expectNoHorizontalOverflow, ShellPage } from "../pages";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  runWithE2ECleanup,
} from "../utils/testData";

const duplicatedPlanDefaultName = "Playwright Tempo Builder (Copy)";

test("an owned activity plan card with established thresholds shows load and intensity", async ({
  athleteActor,
  athletePage,
}) => {
  const plans = new ActivityPlansPage(athletePage);
  await plans.openLibrary();
  await plans.search("Playwright Tempo Builder");

  const card = athletePage.getByTestId(`activity-plan-card-${athleteActor.activityPlanId}`);
  await expect(card).toBeVisible();
  await expect(card.getByLabel(/Load, (?!Unavailable)/)).toBeVisible();
  await expect(card.getByLabel(/Intensity, (?!Unavailable)/)).toBeVisible();
  await expect(card.getByLabel(/Load, Unavailable/)).toHaveCount(0);
  await expect(card.getByLabel(/Intensity, Unavailable/)).toHaveCount(0);
});

test("athlete can discover and open the activity plan library", async ({
  athleteActor,
  athletePage,
}) => {
  const shell = new ShellPage(athletePage);
  const plans = new ActivityPlansPage(athletePage);
  await shell.openAccountMenu();
  const activityPlansLink = shell.accountDestination(/activity plans/i);
  await expect(activityPlansLink).toBeVisible();
  await activityPlansLink.click();

  await expect(athletePage).toHaveURL(/\/activity-plans$/);
  await expect(athletePage.getByRole("heading", { name: /^activity plans$/i })).toBeVisible();
  const search = plans.searchInput();
  await expect(search).toBeVisible();
  await expect(athletePage.getByText("20+ activity plans loaded")).toBeVisible();

  await athletePage.getByRole("button", { name: /load more activity plans/i }).click();
  await expect(athletePage.getByText("22 activity plans loaded")).toBeVisible();

  await athletePage.getByRole("button", { name: /^running$/i }).click();
  await expect(athletePage.getByRole("button", { name: /playwright library 02/i })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /playwright library 01/i })).toHaveCount(0);

  await athletePage.getByRole("button", { name: /^all$/i }).click();
  await expect(athletePage).toHaveURL(/\/activity-plans$/);
  await search.fill("Tempo Builder");
  const planCard = plans.card(/playwright tempo builder/i);
  await expect(planCard).toBeVisible();
  await planCard.press("Enter");

  await expect(athletePage).toHaveURL(`/activity-plans/${athleteActor.activityPlanId}`);
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder/i }),
  ).toBeVisible();
  await expect(athletePage.getByText("Bring bottles")).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-structure")).toBeVisible();
  await expect(athletePage.getByTestId("activity-plan-comments")).toBeVisible();
  await expect(athletePage.getByText("Owner", { exact: true })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: /^like$/i })).toBeVisible();
  await expectNoHorizontalOverflow(athletePage);
});

test("athlete can duplicate an owned plan into an editable copy", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  const duplicatedPlanName = e2eArtifactIdentity(testInfo, "duplicated activity plan");
  const cleanup = () =>
    cleanupOwnedActivityPlans(
      {
        planNames: [duplicatedPlanDefaultName, duplicatedPlanName],
      },
      athleteActor.email,
    );

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    const plans = new ActivityPlansPage(athletePage);
    await athletePage.goto(`/activity-plans/${athleteActor.activityPlanId}`);
    await plans.duplicate();

    await expect(
      athletePage.getByRole("heading", { name: duplicatedPlanDefaultName }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: /^edit$/i }).click();
    await athletePage.getByLabel("Plan name").fill(duplicatedPlanName);
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(athletePage.getByRole("heading", { name: duplicatedPlanName })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: duplicatedPlanName })).toBeVisible();

    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await athletePage.getByRole("button", { name: /^delete plan$/i }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans$/);

    await athletePage.goto(`/activity-plans/${athleteActor.activityPlanId}`);
    await expect(
      athletePage.getByRole("heading", { name: "Playwright Tempo Builder" }),
    ).toBeVisible();
    await expect(athletePage.getByText("Tempo", { exact: true })).toBeVisible();
  });
});

test("athlete can author, edit, schedule and comment while planned history protects deletion", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  const authoredPlanName = e2eArtifactIdentity(testInfo, "authored activity plan");
  const editedPlanName = e2eArtifactIdentity(testInfo, "edited activity plan");
  const dateAfter = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const firstDate = dateAfter(3);
  const movedDate = dateAfter(4);
  const finalDate = dateAfter(5);
  const cleanup = () =>
    cleanupOwnedActivityPlans(
      {
        planNames: [authoredPlanName, editedPlanName],
      },
      athleteActor.email,
    );

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    const plans = new ActivityPlansPage(athletePage);
    await plans.create({
      name: authoredPlanName,
      description: "A structured browser-authored activity plan",
      category: "bike",
      firstStep: "Controlled threshold",
    });
    await expect(athletePage.getByText("Controlled threshold")).toBeVisible();

    await athletePage.getByRole("button", { name: /^edit$/i }).click();
    await athletePage.getByLabel("Plan name").fill(editedPlanName);
    const firstStep = plans.step();
    await firstStep.getByRole("button", { name: /, details$/ }).click();
    await firstStep.getByRole("textbox", { name: /, name$/ }).fill("Edited threshold");
    await plans.openDuration();
    await firstStep.getByRole("textbox", { name: /duration minutes$/ }).fill("15");
    await firstStep.getByRole("button", { name: "Close editor" }).click();
    await expect(firstStep.getByRole("button", { name: /duration: 15 min/ })).toBeVisible();
    await expect(firstStep.getByRole("textbox", { name: /duration minutes$/ })).toBeHidden();
    await plans.openTarget();
    await firstStep.getByRole("radio", { name: /, RPE 7$/ }).check();
    await firstStep.getByRole("radio", { name: /, RPE 7$/ }).press("ArrowRight");
    await expect(firstStep.getByRole("radio", { name: /, RPE 7.5$/ })).toBeChecked();
    await firstStep.getByRole("radio", { name: /, RPE 7.5$/ }).press("ArrowLeft");
    await expect(firstStep.getByRole("radio", { name: /, RPE 7$/ })).toBeChecked();
    await firstStep.getByRole("button", { name: "Close editor" }).click();
    await athletePage.getByRole("button", { name: "Add step", exact: true }).click();
    const secondStep = plans.step(1, 2);
    await expect(secondStep.getByRole("textbox", { name: /duration minutes$/ })).toBeFocused();
    await expect(firstStep.getByRole("textbox", { name: /duration minutes$/ })).toBeHidden();
    await expect(firstStep.getByRole("button", { name: /duration: 15 min/ })).toBeVisible();
    await secondStep.getByRole("textbox", { name: /duration minutes$/ }).fill("3");
    await plans.openTarget(1, 1, 2);
    await secondStep.getByRole("radio", { name: /, RPE 3$/ }).check();
    await athletePage.getByTestId("activity-plan-composer-timeline-bar-0").press("Enter");
    await expect(firstStep.getByRole("textbox", { name: /duration minutes$/ })).toBeFocused();
    await expect(secondStep.getByRole("button", { name: /duration: 3 min/ })).toBeVisible();
    await expect(firstStep).toHaveAttribute("data-selected", "true");
    await expect(secondStep).toHaveAttribute("data-selected", "false");
    await expect(firstStep.getByRole("slider")).toHaveCount(0);
    await expect(firstStep.getByRole("button", { name: /Increase|Decrease/ })).toHaveCount(0);
    await expect(firstStep.getByRole("textbox", { name: /, name$/ })).toBeHidden();
    const activeEditor = athletePage.locator('[data-testid^="step-context-editor-"]:visible');
    const assertEditorInViewport = async () => {
      await expect(activeEditor).toHaveCount(1);
      const box = await activeEditor.boundingBox();
      const viewport = athletePage.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      if (!box || !viewport) throw new Error("Missing editor viewport");
      const closeBox = await activeEditor
        .getByRole("button", { name: "Close editor" })
        .boundingBox();
      expect(closeBox?.width).toBeGreaterThanOrEqual(44);
      expect(closeBox?.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      const rowBox = await firstStep.getByTestId("prescription-row").boundingBox();
      expect(rowBox).not.toBeNull();
      if (rowBox) expect(box.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);
    };
    await assertEditorInViewport();
    await athletePage.screenshot({ path: testInfo.outputPath("context-active-duration.png") });
    await firstStep.getByRole("textbox", { name: /duration minutes$/ }).press("Escape");
    const durationTrigger = firstStep.getByRole("button", { name: /, duration:/ });
    await expect(durationTrigger).toBeFocused();
    await durationTrigger.press("Tab");
    await expect(firstStep.getByRole("button", { name: /, target 1:/ })).toBeFocused();
    await athletePage.keyboard.press("Enter");
    await firstStep.getByRole("combobox", { name: /, Target metric$/ }).selectOption("watts");
    const exactEffort = firstStep.getByRole("textbox", { name: /, Intensity$/ });
    await exactEffort.fill("250.1234567");
    await assertEditorInViewport();
    await athletePage.screenshot({ path: testInfo.outputPath("context-active-effort.png") });
    await exactEffort.press("Escape");
    await expect(firstStep.getByRole("button", { name: /target 1: 7 RPE/ })).toBeFocused();
    await expect(firstStep.getByRole("button", { name: /duration: 15 min/ })).toBeVisible();
    await firstStep.getByRole("button", { name: "Step 1 actions" }).click();
    await athletePage.getByRole("menuitem", { name: "Add RPE target" }).click();
    await expect(firstStep.getByRole("radio", { name: /target 2, RPE 5$/ })).toBeFocused();
    await firstStep.getByRole("combobox", { name: /, Target 2 metric$/ }).selectOption("cadence");
    await firstStep.getByRole("textbox", { name: /, Target 2 intensity$/ }).fill("90");
    await firstStep.getByRole("button", { name: /, details$/ }).click();
    await firstStep.getByRole("textbox", { name: /, instructions$/ }).fill("Relax shoulders");
    await firstStep.getByRole("button", { name: "Close editor" }).click();
    await expect(firstStep.getByRole("button", { name: /target 2: 90 rpm/ })).toBeVisible();
    await expect(firstStep.getByRole("button", { name: /, details$/ })).toContainText(
      "Relax shoulders",
    );
    await expectNoHorizontalOverflow(athletePage);
    await firstStep.scrollIntoViewIfNeeded();
    await athletePage.screenshot({ path: testInfo.outputPath("context-rest.png") });
    await plans.openTarget(2);
    await firstStep.getByRole("textbox", { name: /, Target 2 intensity$/ }).fill("invalid");
    await plans.openDuration(1, 2);
    await secondStep.getByRole("textbox", { name: /duration seconds$/ }).fill("1");
    await secondStep.getByRole("button", { name: "Close editor" }).click();
    await expect(
      firstStep.getByRole("button", { name: /target 2: Unresolved effort/ }),
    ).toBeVisible();
    await athletePage.getByRole("button", { name: "Go to the first invalid value" }).click();
    await expect(firstStep.getByRole("textbox", { name: /, Target 2 intensity$/ })).toBeFocused();
    await expect(firstStep.getByRole("textbox", { name: /, Target 2 intensity$/ })).toHaveValue(
      "invalid",
    );
    await assertEditorInViewport();
    await athletePage.screenshot({ path: testInfo.outputPath("context-invalid.png") });
    await firstStep.getByRole("button", { name: "Remove target 2", exact: true }).click();
    await athletePage.getByRole("button", { name: /save changes/i }).click();
    await expect(athletePage.getByRole("heading", { name: editedPlanName })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: editedPlanName })).toBeVisible();
    await expect(athletePage.getByText("Edited threshold", { exact: true })).toBeVisible();
    await expect(athletePage.getByText("900 sec · 7 RPE", { exact: true })).toBeVisible();

    await athletePage.getByRole("button", { name: /^like$/i }).click();
    await expect(athletePage.getByRole("button", { name: /1 like/i })).toBeVisible();
    await athletePage.getByLabel("Add a comment").fill("Ready for Tuesday");
    await athletePage.getByRole("button", { name: /post comment/i }).click();
    await expect(athletePage.getByText("Ready for Tuesday")).toBeVisible();

    await plans.schedule(firstDate);
    await expect(athletePage.getByRole("button", { name: /^reschedule$/i })).toBeVisible();

    await athletePage.getByLabel("Schedule date").fill(movedDate);
    await athletePage.getByRole("button", { name: /^reschedule$/i }).click();
    await expect(athletePage.getByText(`Currently scheduled for ${movedDate}.`)).toBeVisible();

    await athletePage.getByRole("button", { name: /remove from schedule/i }).click();
    await expect(athletePage.getByRole("button", { name: /^schedule$/i })).toBeVisible();

    await plans.schedule(finalDate);
    await expect(athletePage.getByRole("button", { name: /^reschedule$/i })).toBeVisible();

    await athletePage.getByRole("button", { name: /^delete$/i }).click();
    await expect(
      athletePage.getByText(/has planned-session history.*cannot be deleted/i),
    ).toBeVisible();
    await expect(
      athletePage.getByRole("button", { name: "Delete plan", exact: true }),
    ).toBeDisabled();
    await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(athletePage.getByText(`Currently scheduled for ${finalDate}.`)).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByRole("heading", { name: editedPlanName })).toBeVisible();
  });
});

test("athlete can correct an invalid structure and retry authoring", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  const authoredPlanName = e2eArtifactIdentity(testInfo, "structure retry activity plan");
  const cleanup = () =>
    cleanupOwnedActivityPlans({ planNames: [authoredPlanName] }, athleteActor.email);

  await runWithE2ECleanup(testInfo, cleanup, async () => {
    const plans = new ActivityPlansPage(athletePage);
    await plans.openLibrary();
    await plans.startCreate();
    await athletePage.getByLabel("Plan name").fill(authoredPlanName);

    await athletePage.getByRole("button", { name: "Interval 1 actions" }).click();
    await athletePage.getByRole("menuitem", { name: "Delete interval" }).click();
    await expect(athletePage.getByRole("alert")).toContainText("Structure needs attention");
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();

    await athletePage.getByRole("button", { name: "Add interval" }).click();
    await expect(athletePage.getByLabel("Interval name", { exact: true })).toBeFocused();
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeEnabled();
    await plans.openDuration();
    await plans
      .step()
      .getByRole("textbox", { name: /duration seconds$/ })
      .fill("1.5");
    await athletePage.getByRole("button", { name: "Add recovery step" }).click();
    const recovery = athletePage.getByRole("group", { name: "Interval 1, step 2", exact: true });
    await expect(recovery.getByRole("textbox", { name: /duration minutes$/ })).toBeFocused();
    await expect(recovery.getByRole("button", { name: /purpose: recovery/ })).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();
    await athletePage.getByRole("button", { name: "Go to the first invalid value" }).click();
    const first = athletePage.getByRole("group", { name: "Interval 1, step 1", exact: true });
    await expect(first.getByRole("textbox", { name: /duration seconds$/ })).toBeFocused();
    await expect(first.getByRole("textbox", { name: /duration seconds$/ })).toHaveValue("1.5");
    await first.getByRole("textbox", { name: /duration seconds$/ }).fill("0");
    await first.getByRole("textbox", { name: /duration minutes$/ }).fill("10");
    await athletePage.getByRole("button", { name: "Create plan" }).click();
    await expect(athletePage.getByRole("heading", { name: authoredPlanName })).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByTestId("activity-plan-structure")).toContainText("Steady effort");
  });
});
