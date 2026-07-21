import type { Page } from "@playwright/test";

export const planningJourneyIds = [
  "planning.training-path",
  "calendar.navigation",
  "agenda.create",
  "events.recurrence",
  "scheduled-activities.library",
  "scheduled-activities.detail",
  "goals.lifecycle",
  "goals.intelligence",
] as const;

export function planningTestIdentity(prefix: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix} ${suffix}`;
}

export async function openPlanningRoute(page: Page, path: string, heading: RegExp) {
  await page.goto(path);
  await page.getByRole("heading", { level: 1, name: heading }).waitFor();
}
