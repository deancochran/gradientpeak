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

async function openLocalActor(actor: AuthenticatedE2EActor) {
  const page = await actor.createPage("/groups");
  return { context: page.context(), page };
}

async function closeActors(...actors: Array<{ context: BrowserContext; page: Page }>) {
  await Promise.all(actors.map(({ context }) => context.close()));
}

test("owner creates, edits, RSVPs to, cancels an event, and archives its group", async ({
  athletePage,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "group");
  const eventTitle = e2eArtifactIdentity(testInfo, "group event");

  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedGroups([groupName]),
    async () => {
      const groups = new GroupsPage(athletePage);
      await createOpenGroup(athletePage, groupName);

      await athletePage.getByRole("button", { name: "Edit group" }).click();
      await athletePage.getByLabel("Description").fill("Updated browser group description.");
      await athletePage.getByRole("button", { name: "Save changes" }).click();
      await expect(athletePage.getByText("Updated browser group description.")).toBeVisible();

      await createOneOffEvent(athletePage, eventTitle);
      await expect(
        athletePage.getByText("Effective response: no response (defaults to going)"),
      ).toBeVisible();
      await groups.setRsvp("Decline");
      await expect(athletePage.getByText(/Effective response: declined/)).toBeVisible();
      await groups.setRsvp("Restore Going");
      await expect(athletePage.getByText(/Effective response: going/)).toBeVisible();

      await athletePage.getByRole("button", { name: "Edit event", exact: true }).click();
      await athletePage.getByLabel("Location").fill("Updated browser clubhouse");
      await athletePage.getByRole("button", { name: "Save changes" }).click();
      await expect(athletePage.getByText("Updated browser clubhouse")).toBeVisible();

      athletePage.once("dialog", (dialog) => dialog.accept());
      await athletePage.getByRole("button", { name: "Cancel event", exact: true }).click();
      await expect(athletePage.getByText("Cancelled")).toBeVisible();

      await athletePage.getByRole("button", { name: groupName }).click();
      athletePage.once("dialog", (dialog) => dialog.accept());
      await athletePage.getByRole("button", { name: "Archive group" }).click();
      await expect(athletePage).toHaveURL(/\/groups\/?$/);
    },
  );
});

test("a member discovers, joins, reloads, RSVPs, and cannot manage the owner's group", async ({
  athletePage,
  coachActor,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  const groupName = e2eArtifactIdentity(testInfo, "multi-actor group");
  const eventTitle = e2eArtifactIdentity(testInfo, "member event");
  let member: Awaited<ReturnType<typeof openLocalActor>> | undefined;

  try {
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedGroups([groupName]),
      async () => {
        await createOpenGroup(athletePage, groupName);
        const groupUrl = athletePage.url();
        await createOneOffEvent(athletePage, eventTitle);
        const eventUrl = athletePage.url();

        await athletePage.goto(groupUrl);
        await athletePage.getByRole("button", { name: "Requests and invitations" }).click();
        await expect(
          athletePage.getByRole("heading", { name: "Requests and invitations" }),
        ).toBeVisible();
        await expect(athletePage.getByText("No pending invitations.")).toBeVisible();
        await expect(athletePage.getByText("No pending requests.")).toBeVisible();

        member = await openLocalActor(coachActor);
        const memberGroups = new GroupsPage(member.page);
        await member.page.goto(groupUrl);
        await expect(member.page.getByRole("button", { name: "Join group" })).toBeVisible();
        await memberGroups.join();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
        await member.page.reload();
        await expect(member.page.getByRole("button", { name: "Join group" })).toHaveCount(0);
        await expect(member.page.getByRole("button", { name: "View members" })).toBeVisible();
        await expectNoOwnerControls(member.page, [
          "Edit group",
          "Archive group",
          "Create event",
          "Requests and invitations",
        ]);

        await member.page.goto("/groups");
        await member.page.getByRole("tab", { name: "Invitations" }).click();
        await expect(member.page.getByText("No pending invitations.")).toBeVisible();
        await member.page.getByRole("tab", { name: "Requests" }).click();
        await expect(member.page.getByText("No pending access requests.")).toBeVisible();

        await member.page.goto(groupUrl);
        await member.page.getByRole("button", { name: "View members" }).click();
        await expect(member.page.getByRole("heading", { name: "Group members" })).toBeVisible();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
        await expect(
          member.page.getByRole("button", { name: /Promote|Remove|Transfer/ }),
        ).toHaveCount(0);

        await member.page.goto(eventUrl);
        await expect(member.page.getByRole("heading", { name: eventTitle })).toBeVisible();
        await expectNoOwnerControls(member.page, ["Edit event", "Cancel event"]);
        await expect(
          member.page.getByText("Effective response: no response (defaults to going)"),
        ).toBeVisible();
        await memberGroups.setRsvp("Decline");
        await expect(member.page.getByText(/Effective response: declined/)).toBeVisible();
        await memberGroups.setRsvp("Restore Going");
        await expect(member.page.getByText(/Effective response: going/)).toBeVisible();
      },
    );
  } finally {
    if (member) await closeActors(member);
  }
});

test("[P1] owner approves a closed-group request and persists member role management", async ({
  athletePage,
  coachActor,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  const groupName = e2eArtifactIdentity(testInfo, "request managed group");
  let member: Awaited<ReturnType<typeof openLocalActor>> | undefined;

  try {
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedGroups([groupName]),
      async () => {
        const ownerGroups = new GroupsPage(athletePage);
        await createRequestGroup(athletePage, groupName);
        const groupUrl = athletePage.url();

        member = await openLocalActor(coachActor);
        const memberGroups = new GroupsPage(member.page);
        await member.page.goto(groupUrl);
        await memberGroups.requestAccess();
        await expect(member.page.getByText("Request pending", { exact: true })).toBeVisible();
        await member.page.reload();
        await expect(member.page.getByText("Request pending", { exact: true })).toBeVisible();

        await athletePage.goto(groupUrl);
        await ownerGroups.openRequests();
        const request = ownerGroups.requestFor("playwright_coach");
        await expect(request).toBeVisible();
        await request.getByRole("button", { name: "Approve" }).click();
        await expect(athletePage.getByText("No pending requests.", { exact: true })).toBeVisible();

        await member.page.reload();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
        await expect(member.page.getByRole("button", { name: "View members" })).toBeVisible();

        await athletePage.goto(groupUrl);
        await athletePage.getByRole("button", { name: "View members" }).click();
        const memberRow = athletePage.getByRole("article").filter({ hasText: "playwright_coach" });
        await memberRow.getByRole("button", { name: "Promote to admin" }).click();
        await expect(memberRow.getByText("admin", { exact: true })).toBeVisible();
        await athletePage.reload();
        const persistedAdmin = athletePage
          .getByRole("article")
          .filter({ hasText: "playwright_coach" });
        await expect(persistedAdmin.getByText("admin", { exact: true })).toBeVisible();

        await persistedAdmin.getByRole("button", { name: "Demote to member" }).click();
        await expect(persistedAdmin.getByText("member", { exact: true })).toBeVisible();
        athletePage.once("dialog", (dialog) => dialog.accept());
        await persistedAdmin.getByRole("button", { name: "Remove", exact: true }).click();
        await expect(
          athletePage.getByRole("article").filter({ hasText: "playwright_coach" }),
        ).toHaveCount(0);

        await member.page.reload();
        await expect(member.page.getByRole("button", { name: "Request access" })).toBeVisible();
        await expect(member.page.getByRole("button", { name: "View members" })).toHaveCount(0);
      },
    );
  } finally {
    if (member) await closeActors(member);
  }
});
