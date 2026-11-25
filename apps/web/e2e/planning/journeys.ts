import { type Page, test } from "@playwright/test";
import { createE2EExecutionIdentity } from "../support/identity";

export const planningJourneyIds = [
  "planning.training-path",
  "calendar.navigation",
  "agenda.create",
  "events.recurrence",
  "goals.lifecycle",
  "goals.intelligence",
] as const;

export function planningTestIdentity(prefix: string) {
  return createE2EExecutionIdentity(test.info()).name(prefix);
}

export async function openPlanningRoute(page: Page, path: string, heading: RegExp) {
  await page.goto(path);
  await page.getByRole("heading", { level: 1, name: heading }).waitFor();
}
