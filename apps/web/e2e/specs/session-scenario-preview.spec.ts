import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { createSessionScenarioFixture } from "../support/scenario-fixture";

test("a published bike baseline supports each read-only session scenario without durable writes", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(90_000);
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
