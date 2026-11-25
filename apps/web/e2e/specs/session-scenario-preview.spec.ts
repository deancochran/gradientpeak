import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { createSessionScenarioFixture } from "../support/scenario-fixture";

async function setScenarioViewport(
  page: Parameters<typeof expectNoHorizontalOverflow>[0],
  projectName: string,
) {
  if (projectName === "Desktop Chrome") await page.setViewportSize({ width: 1440, height: 1000 });
}

function applyScenarioRequest(body: unknown) {
  const candidate = body as { 0?: { json?: unknown } };
  if (!candidate[0]?.json) throw new Error("Expected a batched apply-scenario request.");
  return candidate[0].json as {
    expectedPreviewFingerprint: string;
    operationId: string;
    preview: { sessionId: string };
  };
}

test("a published bike baseline supports each read-only session scenario without durable writes", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(90_000);
  await setScenarioViewport(athletePage, testInfo.project.name);
  const fixture = await createSessionScenarioFixture({
    actor: athleteActor,
    database: e2eDatabase,
    e2eData,
    identity: e2eIdentity,
  });
  const before = await fixture.snapshot();
  await athletePage.goto(
    `/calendar/events/${fixture.sessionId}?resourceType=planned_session&month=${fixture.date.slice(0, 7)}&view=agenda`,
  );
  await expect(
    athletePage.getByRole("heading", { name: "Explore a session scenario" }),
  ).toBeVisible();
  await expect(
    athletePage.getByText(/Current plan revision 1; athlete state revision/),
  ).toBeVisible();
  const chart = athletePage.getByRole("img", {
    name: /Baseline and alternative training-load projections shown over the same planning horizon/i,
  });
  await expect(chart).toBeVisible();
  const comparison = athletePage.getByRole("region", { name: "Explore a session scenario" });
  await expect(comparison.getByLabel("Chart legend")).toContainText("Baseline");
  await expect(comparison.getByLabel("Chart legend")).toContainText("Alternative");

  await athletePage.getByRole("button", { name: "less", exact: true }).click();
  await athletePage.getByLabel("Target duration (seconds)").fill("1200");
  await expect(athletePage.getByRole("img", { name: /Baseline and alternative/i })).toBeVisible();
  await athletePage.getByRole("button", { name: "more", exact: true }).click();
  await athletePage.getByLabel("Target duration (seconds)").fill("3600");
  await expect(athletePage.getByRole("img", { name: /Baseline and alternative/i })).toBeVisible();
  await athletePage.getByRole("button", { name: "substitute", exact: true }).click();
  await athletePage.getByLabel("Substitute activity plan").selectOption(fixture.substituteId);
  await expect(athletePage.getByRole("img", { name: /Baseline and alternative/i })).toBeVisible();
  await athletePage.getByRole("button", { name: "skip", exact: true }).click();
  await expect(athletePage.getByRole("img", { name: /Baseline and alternative/i })).toBeVisible();
  await expect(
    chart.locator(`[data-source="projected"][data-date="${fixture.horizonDate}"]`),
  ).toHaveCount(3);
  await expect(chart.locator(`[data-source="projected"][data-date="${fixture.date}"]`)).toHaveCount(
    0,
  );
  await expect(
    athletePage.getByText(`${fixture.sessionCount} sessions in the shared horizon.`),
  ).toBeVisible();

  await expectNoHorizontalOverflow(athletePage);
  await comparison.scrollIntoViewIfNeeded();
  await athletePage.screenshot({
    path: testInfo.outputPath("session-scenario-comparison-viewport.png"),
  });
  await athletePage.screenshot({
    fullPage: true,
    path: testInfo.outputPath("session-scenario-preview.png"),
  });
  await expect(fixture.snapshot()).resolves.toEqual(before);
  await athletePage.getByRole("link", { name: "Back to day" }).click();
  await expect(athletePage).toHaveURL((url) => url.pathname === `/calendar/day/${fixture.date}`);
});

test("a confirmed scenario applies one selected occurrence and retries a lost acknowledgement safely", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(90_000);
  await setScenarioViewport(athletePage, testInfo.project.name);
  const fixture = await createSessionScenarioFixture({
    actor: athleteActor,
    database: e2eDatabase,
    e2eData,
    identity: e2eIdentity,
  });
  const before = await fixture.snapshot();
  await athletePage.goto(
    `/calendar/events/${fixture.sessionId}?resourceType=planned_session&month=${fixture.date.slice(0, 7)}&view=agenda`,
  );
  await athletePage.getByRole("button", { name: "less", exact: true }).click();
  await athletePage.getByLabel("Target duration (seconds)").fill("1200");
  await athletePage.getByRole("button", { name: "Apply this scenario" }).click();
  const confirmation = athletePage.getByRole("dialog");
  await expect(confirmation).toContainText("affects only this selected occurrence");
  await expect(athletePage.getByRole("button", { name: "Confirm apply" })).toBeFocused();
  await athletePage.screenshot({
    path: testInfo.outputPath("session-scenario-confirmation.png"),
  });
  await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(athletePage.getByRole("button", { name: "Apply this scenario" })).toBeFocused();
  await expect(fixture.snapshot()).resolves.toEqual(before);

  await athletePage.getByRole("button", { name: "Apply this scenario" }).click();
  const applyRequests: unknown[] = [];
  await athletePage.route("**/api/trpc/plannedSessions.applyScenario?batch=1", async (route) => {
    applyRequests.push(route.request().postDataJSON());
    await route.fetch();
    await route.abort();
  });
  await athletePage.getByRole("button", { name: "Confirm apply" }).click();
  await expect(
    athletePage.getByText(/could not confirm whether the change was applied/i),
  ).toBeVisible();
  await athletePage.screenshot({
    path: testInfo.outputPath("session-scenario-unknown-result.png"),
  });
  await athletePage.unroute("**/api/trpc/plannedSessions.applyScenario?batch=1");
  await athletePage.reload();
  const recovery = athletePage.getByRole("button", { name: "Check or retry this change" });
  await expect(recovery).toBeVisible();
  await recovery.scrollIntoViewIfNeeded();
  await athletePage.screenshot({
    path: testInfo.outputPath("session-scenario-recovery.png"),
  });
  await athletePage.route("**/api/trpc/plannedSessions.applyScenario?batch=1", async (route) => {
    applyRequests.push(route.request().postDataJSON());
    await route.continue();
  });
  await recovery.click();
  await expect(athletePage.getByText(/Applied: repointed/i)).toBeVisible();
  await athletePage.getByText(/Applied: repointed/i).scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(athletePage);
  await athletePage.screenshot({
    path: testInfo.outputPath("session-scenario-success.png"),
  });
  expect(applyRequests).toHaveLength(2);
  expect(applyRequests[1]).toEqual(applyRequests[0]);
  const request = applyScenarioRequest(applyRequests[0]);
  expect(request.preview.sessionId).toBe(fixture.sessionId);
  expect(request.expectedPreviewFingerprint).toMatch(/^v1:sha256:[0-9a-f]{64}$/);
  await expect(fixture.operationReceiptCount(request.operationId)).resolves.toBe(1);
  await athletePage.unroute("**/api/trpc/plannedSessions.applyScenario?batch=1");

  const [sessions, plans] = await fixture.snapshot();
  const selected = sessions.find((session) => session.id === fixture.sessionId);
  const otherOccurrence = sessions.find((session) => session.id !== fixture.sessionId);
  expect(selected?.activity_plan_id).not.toBe(fixture.activityPlanId);
  expect(otherOccurrence?.activity_plan_id).toBe(fixture.activityPlanId);
  expect(plans).toHaveLength(before[1].length + 1);
});
