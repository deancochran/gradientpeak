import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import {
  createOneOffEvent,
  createOpenGroup,
  resetLocalGroupE2ERateLimits,
} from "../lane-support/groups/journeys";
import { openAppPage } from "../utils/navigation";
import {
  authenticateTestActor,
  cleanupOwnedGroups,
  e2eArtifactIdentity,
  runWithE2ECleanup,
  type TestUserRole,
} from "../utils/testData";

function loopbackIdentity(role: TestUserRole, projectName: string) {
  const projectOffset =
    Array.from(projectName).reduce((total, character) => total + character.charCodeAt(0), 0) % 200;
  const roleOffset = role === "coach" ? 20 : 10;
  return `127.0.0.${roleOffset + projectOffset}`;
}

async function openLocalActor(
  browser: Browser,
  input: {
    baseURL: string;
    projectName: string;
    role: TestUserRole;
    viewport: { height: number; width: number };
  },
) {
  const context = await browser.newContext({
    baseURL: input.baseURL,
    extraHTTPHeaders: {
      "x-forwarded-for": loopbackIdentity(input.role, input.projectName),
    },
    viewport: input.viewport,
  });
  await authenticateTestActor(context.request, input.role, { persistStorageState: false });
  const page = await context.newPage();
  await openAppPage(page, "/groups");
  return { context, page };
}

async function closeActors(...actors: Array<{ context: BrowserContext; page: Page }>) {
  await Promise.all(actors.map(({ context }) => context.close()));
}

test("owner creates, edits, RSVPs to, cancels an event, and archives its group", async ({
  athletePage,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "group");
  const eventTitle = e2eArtifactIdentity(testInfo, "group event");

  await resetLocalGroupE2ERateLimits();
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedGroups([groupName]),
    async () => {
      await createOpenGroup(athletePage, groupName);

      await athletePage.getByRole("button", { name: "Edit group" }).click();
      await athletePage.getByLabel("Description").fill("Updated browser group description.");
      await athletePage.getByRole("button", { name: "Save changes" }).click();
      await expect(athletePage.getByText("Updated browser group description.")).toBeVisible();

      await createOneOffEvent(athletePage, eventTitle);
      await expect(
        athletePage.getByText("Effective response: no response (defaults to going)"),
      ).toBeVisible();
      await athletePage.getByRole("button", { name: "Decline", exact: true }).click();
      await expect(athletePage.getByText(/Effective response: declined/)).toBeVisible();
      await athletePage.getByRole("button", { name: "Restore Going", exact: true }).click();
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
  browser,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  const groupName = e2eArtifactIdentity(testInfo, "multi-actor group");
  const eventTitle = e2eArtifactIdentity(testInfo, "member event");
  await resetLocalGroupE2ERateLimits();
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

        member = await openLocalActor(browser, {
          baseURL: testInfo.project.use.baseURL ?? "http://127.0.0.1:3000",
          projectName: testInfo.project.name,
          role: "coach",
          viewport: testInfo.project.use.viewport ?? { height: 720, width: 1280 },
        });
        await member.page.goto(groupUrl);
        await expect(member.page.getByRole("button", { name: "Join group" })).toBeVisible();
        await member.page.getByRole("button", { name: "Join group" }).click();
        await expect(member.page.getByText("member", { exact: true })).toBeVisible();
        await member.page.reload();
        await expect(member.page.getByRole("button", { name: "Join group" })).toHaveCount(0);
        await expect(member.page.getByRole("button", { name: "View members" })).toBeVisible();
        await expect(member.page.getByRole("button", { name: "Edit group" })).toHaveCount(0);
        await expect(member.page.getByRole("button", { name: "Archive group" })).toHaveCount(0);
        await expect(member.page.getByRole("button", { name: "Create event" })).toHaveCount(0);
        await expect(
          member.page.getByRole("button", { name: "Requests and invitations" }),
        ).toHaveCount(0);

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
        await expect(member.page.getByRole("button", { name: "Edit event" })).toHaveCount(0);
        await expect(member.page.getByRole("button", { name: "Cancel event" })).toHaveCount(0);
        await expect(
          member.page.getByText("Effective response: no response (defaults to going)"),
        ).toBeVisible();
        await member.page.getByRole("button", { name: "Decline", exact: true }).click();
        await expect(member.page.getByText(/Effective response: declined/)).toBeVisible();
        await member.page.getByRole("button", { name: "Restore Going", exact: true }).click();
        await expect(member.page.getByText(/Effective response: going/)).toBeVisible();
      },
    );
  } finally {
    if (member) await closeActors(member);
  }
});
