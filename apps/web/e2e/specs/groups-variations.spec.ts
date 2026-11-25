import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import {
  createOneOffEvent,
  createOpenGroup,
  createRequestGroup,
} from "../lane-support/groups/journeys";
import { expectNoOwnerControls, GroupsPage } from "../pages";
import type { AuthenticatedE2EActor } from "../support/actors";
import { cleanupOwnedGroups, e2eArtifactIdentity, runWithE2ECleanup } from "../utils/testData";

async function openMember(actor: AuthenticatedE2EActor, viewport = { width: 1280, height: 720 }) {
  const page = await actor.createPage("/groups", { viewport });
  const context = page.context();
  return { context, page };
}

async function closeMember(member: { context: BrowserContext; page: Page } | undefined) {
  await member?.context.close();
}

test("[variation:groups.owner:cancel-archive] dismissing archive confirmation keeps the edited group and event reachable", async ({
  athletePage,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "cancel archive group");
  const eventTitle = e2eArtifactIdentity(testInfo, "retained group event");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedGroups([groupName]),
    async () => {
      await createOpenGroup(athletePage, groupName);
      const groupUrl = athletePage.url();
      await createOneOffEvent(athletePage, eventTitle);
      athletePage.once("dialog", (dialog) => dialog.dismiss());
      await athletePage.getByRole("button", { name: "Cancel event", exact: true }).click();
      await expect(athletePage.getByText("Cancelled")).toHaveCount(0);
      await athletePage.goto(groupUrl);
      athletePage.once("dialog", (dialog) => dialog.dismiss());
      await athletePage.getByRole("button", { name: "Archive group" }).click();
      await expect(athletePage.getByRole("heading", { name: groupName })).toBeVisible();
      await athletePage.reload();
      await expect(athletePage.getByRole("button", { name: "Archive group" })).toBeVisible();
    },
  );
});

test("[variation:groups.owner:keyboard-rsvp] owner keyboard RSVP changes persist after returning from group detail", async ({
  athletePage,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "keyboard owner group");
  const eventTitle = e2eArtifactIdentity(testInfo, "keyboard owner event");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedGroups([groupName]),
    async () => {
      const groups = new GroupsPage(athletePage);
      await createOpenGroup(athletePage, groupName);
      await createOneOffEvent(athletePage, eventTitle);
      const eventUrl = athletePage.url();
      await groups.setRsvp("Decline", "keyboard");
      await expect(athletePage.getByText(/Effective response: declined/)).toBeVisible();
      await athletePage.getByRole("button", { name: groupName }).click();
      await athletePage.goBack();
      await expect(athletePage).toHaveURL(eventUrl);
      await expect(athletePage.getByText(/Effective response: declined/)).toBeVisible();
      await groups.setRsvp("Restore Going", "keyboard");
      await expect(athletePage.getByText(/Effective response: going/)).toBeVisible();
    },
  );
});

test("[variation:groups.member:narrow-permissions] narrow member joins, scrolls event detail, and retains non-owner controls after reload", async ({
  athletePage,
  coachActor,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "narrow member group");
  const eventTitle = e2eArtifactIdentity(testInfo, "narrow member event");
  let member: Awaited<ReturnType<typeof openMember>> | undefined;
  try {
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedGroups([groupName]),
      async () => {
        await createOpenGroup(athletePage, groupName);
        const groupUrl = athletePage.url();
        await createOneOffEvent(athletePage, eventTitle);
        const eventUrl = athletePage.url();
        member = await openMember(coachActor, { width: 390, height: 844 });
        const memberGroups = new GroupsPage(member.page);
        await member.page.goto(groupUrl);
        await memberGroups.join();
        await member.page.goto(eventUrl);
        await member.page.getByRole("heading", { name: eventTitle }).scrollIntoViewIfNeeded();
        await memberGroups.setRsvp("Decline");
        await member.page.reload();
        await expect(member.page.getByText(/Effective response: declined/)).toBeVisible();
        await expectNoOwnerControls(member.page, ["Edit event", "Cancel event"]);
      },
    );
  } finally {
    await closeMember(member);
  }
});

test("[variation:groups.member:history] member group and event back-forward navigation retains membership and RSVP", async ({
  athletePage,
  coachActor,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "member history group");
  const eventTitle = e2eArtifactIdentity(testInfo, "member history event");
  let member: Awaited<ReturnType<typeof openMember>> | undefined;
  try {
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedGroups([groupName]),
      async () => {
        await createOpenGroup(athletePage, groupName);
        const groupUrl = athletePage.url();
        await createOneOffEvent(athletePage, eventTitle);
        const eventUrl = athletePage.url();
        member = await openMember(coachActor);
        const memberGroups = new GroupsPage(member.page);
        await member.page.goto(groupUrl);
        await memberGroups.join();
        await member.page.goto(eventUrl);
        await memberGroups.setRsvp("Decline");
        await member.page.goBack();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
        await member.page.goForward();
        await expect(member.page.getByText(/Effective response: declined/)).toBeVisible();
      },
    );
  } finally {
    await closeMember(member);
  }
});

test("[variation:groups.requests:reject-retry] owner rejection removes pending state and lets the same actor request again", async ({
  athletePage,
  coachActor,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "rejected request group");
  let member: Awaited<ReturnType<typeof openMember>> | undefined;
  try {
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedGroups([groupName]),
      async () => {
        const ownerGroups = new GroupsPage(athletePage);
        await createRequestGroup(athletePage, groupName);
        const groupUrl = athletePage.url();
        member = await openMember(coachActor);
        const memberGroups = new GroupsPage(member.page);
        await member.page.goto(groupUrl);
        await memberGroups.requestAccess();
        await athletePage.goto(groupUrl);
        await ownerGroups.openRequests();
        await ownerGroups.respondToRequest("playwright_coach", "Decline");
        await expect(athletePage.getByText("No pending requests.", { exact: true })).toBeVisible();
        await member.page.reload();
        await expect(member.page.getByRole("button", { name: "Request access" })).toBeVisible();
        await memberGroups.requestAccess();
        await expect(member.page.getByText("Request pending", { exact: true })).toBeVisible();
      },
    );
  } finally {
    await closeMember(member);
  }
});

test("[variation:groups.requests:approval-history] approved member opens members detail and retains role through browser history", async ({
  athletePage,
  coachActor,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "approved history group");
  let member: Awaited<ReturnType<typeof openMember>> | undefined;
  try {
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedGroups([groupName]),
      async () => {
        const ownerGroups = new GroupsPage(athletePage);
        await createRequestGroup(athletePage, groupName);
        const groupUrl = athletePage.url();
        member = await openMember(coachActor);
        const memberGroups = new GroupsPage(member.page);
        await member.page.goto(groupUrl);
        await memberGroups.requestAccess();
        await athletePage.goto(groupUrl);
        await ownerGroups.openRequests();
        await ownerGroups.respondToRequest("playwright_coach", "Approve");
        await member.page.reload();
        await member.page.getByRole("button", { name: "View members" }).click();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
        await member.page.goBack();
        await expect(member.page.getByRole("button", { name: "View members" })).toBeVisible();
        await member.page.goForward();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
      },
    );
  } finally {
    await closeMember(member);
  }
});
