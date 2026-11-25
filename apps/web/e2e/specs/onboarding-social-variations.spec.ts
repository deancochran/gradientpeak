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

test("[variation:social.follow:keyboard] keyboard follow from a discovered profile survives reload", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredProfile(athletePage, fixture);
    const follow = athletePage.getByRole("button", { name: /^follow$/i });
    await follow.scrollIntoViewIfNeeded();
    await follow.focus();
    await expect(follow).toBeFocused();
    await follow.press("Enter");
    await expect.poll(fixture.readFollowStatus).toBe("accepted");
    await athletePage.reload();
    await expect(athletePage.getByRole("button", { name: /unfollow/i })).toBeVisible();
  });
});

test("[variation:social.follow:toggle] following then unfollowing restores the profile action", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredProfile(athletePage, fixture);
    await athletePage.getByRole("button", { name: /^follow$/i }).click();
    await expect.poll(fixture.readFollowStatus).toBe("accepted");
    await athletePage.getByRole("button", { name: /unfollow/i }).click();
    await expect.poll(fixture.readFollowStatus).toBeNull();
    await athletePage.reload();
    await expect(athletePage.getByRole("button", { name: /^follow$/i })).toBeVisible();
  });
});

test("[variation:social.open-group:narrow] narrow group detail joins and retains membership", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await athletePage.setViewportSize({ width: 390, height: 844 });
    await openDiscoveredGroup(athletePage, {
      groupId: fixture.openGroupId,
      groupName: fixture.openGroupName,
    });
    await new GroupsPage(athletePage).join();
    await expect.poll(() => fixture.readGroupMembership(fixture.openGroupId)).toBe("member");
    await athletePage.reload();
    await expect(athletePage.getByText("member", { exact: true })).toBeVisible();
  });
});

test("[variation:social.open-group:keyboard-history] keyboard join remains visible after leaving and returning to the group", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredGroup(athletePage, {
      groupId: fixture.openGroupId,
      groupName: fixture.openGroupName,
    });
    await athletePage.getByRole("button", { name: /^join group$/i }).press("Enter");
    await expect.poll(() => fixture.readGroupMembership(fixture.openGroupId)).toBe("member");
    await athletePage.goto("/groups");
    await athletePage.goBack();
    await expect(athletePage.getByText("member", { exact: true })).toBeVisible();
  });
});

test("[variation:social.closed-group:keyboard-request] keyboard request retains exact pending state after reload", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredGroup(athletePage, {
      groupId: fixture.closedGroupId,
      groupName: fixture.closedGroupName,
    });
    const request = athletePage.getByRole("button", { name: "Request access" });
    await request.focus();
    await request.press("Enter");
    await expect.poll(() => fixture.readJoinRequest(fixture.closedGroupId)).toBe("pending");
    await athletePage.reload();
    await expect(athletePage.getByText("Request pending", { exact: true })).toBeVisible();
  });
});

test("[variation:social.closed-group:cancel-request] pending access can be cancelled and requested again", async ({
  athletePage,
  coachActor: _coachActor,
}, testInfo) => {
  await withOnboardingSocialFixture(athletePage.request, testInfo, async (fixture) => {
    await openDiscoveredGroup(athletePage, {
      groupId: fixture.closedGroupId,
      groupName: fixture.closedGroupName,
    });
    const groupUrl = athletePage.url();
    await new GroupsPage(athletePage).requestAccess();
    await expect.poll(() => fixture.readJoinRequest(fixture.closedGroupId)).toBe("pending");
    await athletePage.goto("/groups");
    await athletePage.getByRole("tab", { name: "Requests" }).click();
    await athletePage.getByRole("button", { name: "Cancel request" }).click();
    await expect.poll(() => fixture.readJoinRequest(fixture.closedGroupId)).toBe("cancelled");
    await athletePage.goto(groupUrl);
    await expect(athletePage.getByRole("button", { name: "Request access" })).toBeVisible();
    await new GroupsPage(athletePage).requestAccess();
    await expect.poll(() => fixture.readJoinRequest(fixture.closedGroupId)).toBe("pending");
    await athletePage.reload();
    await expect(athletePage.getByText("Request pending", { exact: true })).toBeVisible();
  });
});
