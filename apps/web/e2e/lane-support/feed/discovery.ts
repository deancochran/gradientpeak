import type { Page } from "@playwright/test";
import { isTrpcProcedure } from "../../pages/network";

export const DISCOVERY_SCOPES = [
  { label: "Activity plans", procedure: "activityPlans.list" },
  { label: "Training plans", procedure: "trainingPlans.listTemplates" },
  { label: "Routes", procedure: "routes.list" },
  { label: "Profiles", procedure: "social.searchUsers" },
  { label: "Groups", procedure: "groups.listDiscoverable" },
] as const;

export async function waitForProcedure(page: Page, procedure: string) {
  return page.waitForResponse((response) => isTrpcProcedure(new URL(response.url()), procedure));
}
