import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { withOnboardingSocialFixture } from "../onboarding/social-fixture";
import { GroupsPage } from "../pages";

async function openDiscoveredProfile(
  page: Page,
  fixture: { personId: string; personName: string },
) {
  await page.goto("/search");
  await page.getByRole("tab", { name: "Profiles" }).click();
  await page.getByRole("textbox", { name: "Search profiles" }).fill(fixture.personName);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByTestId(`discover-users-${fixture.personId}`)
    .getByRole("link", { name: "View profile" })
    .click();
}

async function openDiscoveredGroup(page: Page, fixture: { groupId: string; groupName: string }) {
  await page.goto("/search");
  await page.getByRole("tab", { name: "Groups" }).click();
  await page.getByRole("textbox", { name: "Search groups" }).fill(fixture.groupName);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByTestId(`discover-groups-${fixture.groupId}`)
    .getByRole("link", { name: "View group" })
    .click();
}

test("[P1] completed athlete follows a discovered person and retains the relationship", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredProfile(athletePage, fixture);
    await expect(athletePage.getByRole("heading", { name: fixture.personName })).toBeVisible();
    await athletePage.getByRole("button", { name: /^follow$/i }).click();
    await expect.poll(fixture.readFollowStatus).toBe("accepted");
    await expect(athletePage.getByRole("button", { name: /unfollow/i })).toBeVisible();

    await athletePage.reload();
    await expect(athletePage.getByRole("button", { name: /unfollow/i })).toBeVisible();
    await expect.poll(fixture.readFollowStatus).toBe("accepted");
  });
});

test("[P1] completed athlete joins an open discovered group and retains membership", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredGroup(athletePage, {
      groupId: fixture.openGroupId,
      groupName: fixture.openGroupName,
    });
    await new GroupsPage(athletePage).join();
    await expect.poll(() => fixture.readGroupMembership(fixture.openGroupId)).toBe("member");
    await expect(athletePage.getByText("member", { exact: true })).toBeVisible();

    await athletePage.reload();
    await expect(athletePage.getByText("member", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.readGroupMembership(fixture.openGroupId)).toBe("member");
  });
});

test("[P1] completed athlete requests a closed discovered group and retains pending access", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredGroup(athletePage, {
      groupId: fixture.closedGroupId,
      groupName: fixture.closedGroupName,
    });
    await new GroupsPage(athletePage).requestAccess();
    await expect.poll(() => fixture.readJoinRequest(fixture.closedGroupId)).toBe("pending");
    await expect(athletePage.getByText("Request pending", { exact: true })).toBeVisible();

    await athletePage.reload();
    await expect(athletePage.getByText("Request pending", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.readJoinRequest(fixture.closedGroupId)).toBe("pending");
  });
});
