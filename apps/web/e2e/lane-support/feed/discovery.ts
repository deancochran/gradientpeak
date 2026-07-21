import type { Page } from "@playwright/test";

export const DISCOVERY_SCOPES = [
  { label: "Activity plans", procedure: "activityPlans.list" },
  { label: "Training plans", procedure: "trainingPlans.listTemplates" },
  { label: "Routes", procedure: "routes.list" },
  { label: "Profiles", procedure: "social.searchUsers" },
  { label: "Groups", procedure: "groups.listDiscoverable" },
] as const;

export async function waitForProcedure(page: Page, procedure: string) {
  return page.waitForResponse(
    (response) => response.url().includes("/api/trpc/") && response.url().includes(procedure),
  );
}
