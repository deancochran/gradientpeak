import type { Page, TestInfo } from "@playwright/test";
import { GroupsPage } from "../../pages/groups";
import { createE2EExecutionIdentity } from "../../support/identity";

export function uniqueGroupName(testInfo: TestInfo, prefix = "Parity group") {
  return createE2EExecutionIdentity(testInfo).name(prefix);
}

export async function createOpenGroup(page: Page, name: string) {
  await new GroupsPage(page).create(name, "open");
}

export async function createRequestGroup(page: Page, name: string) {
  await new GroupsPage(page).create(name, "request_to_join");
}

export async function createOneOffEvent(page: Page, title: string, date = "2027-06-14") {
  await new GroupsPage(page).createEvent(title, date);
}
