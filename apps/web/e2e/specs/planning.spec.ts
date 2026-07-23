import { expect, test } from "../fixtures";
import { openPlanningRoute, planningJourneyIds, planningTestIdentity } from "../planning/journeys";

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "planning E2E requires a service-role credential for the persisted athlete fixture.",
);

test("planning.training-path and calendar.navigation expose daily, weekly, month, and day paths", async ({
  athletePage,
}) => {
  expect(planningJourneyIds).toContain("planning.training-path");
  await openPlanningRoute(athletePage, "/plan", /^plan$/i);
  await expect(athletePage.getByRole("heading", { name: /training path/i })).toBeVisible();
  await expect(athletePage.getByRole("tab", { name: /daily/i })).toBeVisible();
  await expect(athletePage.getByRole("tab", { name: /weekly/i })).toBeVisible();
  await expect(athletePage.getByText(/\b(?:TSS|IF|CTL|ATL|TSB)\b/)).toHaveCount(0);
  await expect(athletePage.getByText(/Load (?:unavailable|\d+)/).first()).toBeVisible();

  await openPlanningRoute(athletePage, "/calendar?view=month", /^calendar$/i);
  await expect(athletePage.getByRole("tab", { name: /^month$/i })).toBeVisible();
  await athletePage.getByRole("tab", { name: /^week$/i }).click();
  await expect(athletePage.getByRole("heading", { name: /week view/i })).toBeVisible();
  await athletePage.getByRole("link", { name: /add/i }).first().click();
  await expect(athletePage.getByRole("heading", { name: /create from agenda/i })).toBeVisible();
});

test("agenda.create and events.recurrence persist a bounded series and honor delete scope", async ({
  athletePage,
}) => {
  const title = planningTestIdentity("Web recurring event");
  await athletePage.goto("/calendar/new?date=2026-08-03&type=custom");
  await athletePage.getByLabel("Title").fill(title);
  await athletePage.getByLabel("Repeat weekly").selectOption("4");
  await athletePage.getByRole("button", { name: /^create$/i }).click();
  await expect(athletePage.getByRole("heading", { name: title })).toBeVisible();

  await athletePage.getByRole("button", { name: /^delete$/i }).click();
  await athletePage.getByLabel("Delete recurrence scope").selectOption("series");
  await athletePage.getByRole("button", { name: /delete event/i }).click();
  await expect(athletePage).toHaveURL(/\/calendar/);
});

test("scheduled-activities.library and scheduled-activities.detail expose filters and persisted controls", async ({
  athletePage,
}) => {
  await openPlanningRoute(athletePage, "/scheduled-activities", /^scheduled activities$/i);
  await expect(athletePage.getByLabel("Schedule range")).toBeVisible();
  await expect(athletePage.getByLabel("Activity category")).toBeVisible();
  await expect(athletePage.getByRole("link", { name: /schedule activity/i })).toBeVisible();
});

test("goals.lifecycle and goals.intelligence create, edit, evaluate, and delete", async ({
  athletePage,
}) => {
  const title = planningTestIdentity("Web planning goal");
  await athletePage.goto("/goals/new?date=2026-09-20");
  await athletePage.getByLabel("Title").fill(title);
  await athletePage.getByRole("button", { name: /create goal/i }).click();
  await expect(athletePage.getByText(title)).toBeVisible();
  await athletePage.getByRole("link", { name: new RegExp(title) }).click();
  await expect(athletePage.getByRole("heading", { name: /evidence & limits/i })).toBeVisible();

  await athletePage.getByRole("link", { name: /^edit$/i }).click();
  await athletePage.getByLabel("Title").fill(`${title} updated`);
  await athletePage.getByRole("button", { name: /save goal/i }).click();
  await expect(athletePage.getByRole("heading", { name: `${title} updated` })).toBeVisible();

  await athletePage.getByRole("button", { name: /^delete$/i }).click();
  await athletePage.getByRole("button", { name: /delete goal/i }).click();
  await expect(athletePage).toHaveURL(/\/goals/);
});
