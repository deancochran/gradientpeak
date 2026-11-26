import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  coachingAssignments,
  coachingEngagements,
  conversationParticipants,
  conversations,
  messages,
  organizationMembershipRoleGrants,
  organizationMemberships,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow, withTrpcFailure } from "../pages";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expectNoHorizontalOverflow(page);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path, scale: "css" });
  await testInfo.attach(name, { contentType: "image/png", path });
}

async function expectUsable(control: Locator) {
  await expect(control).toBeVisible();
  const geometry = await control.evaluate((element) => {
    const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
    const inset = Math.min(4, width / 4, height / 4);
    const points: Array<[number, number]> = [
      [left + inset, top + inset],
      [right - inset, top + inset],
      [left + width / 2, top + height / 2],
      [left + inset, bottom - inset],
      [right - inset, bottom - inset],
    ];
    return {
      top,
      bottom,
      left,
      right,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      hits: points.map(([x, y]) => element.contains(document.elementFromPoint(x, y))),
    };
  });
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.height).toBeGreaterThan(0);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.hits).toEqual([true, true, true, true, true]);
}

async function seedCoachAssignment(input: {
  athletePage: Page;
  athleteId: string;
  coachId: string;
  e2eDatabase: import("../support/database").LocalE2EDatabase;
  e2eIdentity: import("../support/identity").E2EExecutionIdentity;
}) {
  const { athletePage, athleteId, coachId, e2eDatabase, e2eIdentity } = input;
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Message retry");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`message-retry-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization ID");
  const membershipId = e2eIdentity.uuid("coach-membership");
  const engagementId = e2eIdentity.uuid("engagement");
  await e2eDatabase.typedTransaction(async (transaction) => {
    await transaction.insert(organizationMemberships).values({
      id: membershipId,
      organization_id: organizationId,
      profile_id: coachId,
    });
    await transaction.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: membershipId,
      role_key: "coach",
    });
    await transaction.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: athleteId,
    });
    await transaction.insert(coachingAssignments).values({
      organization_id: organizationId,
      engagement_id: engagementId,
      coach_membership_id: membershipId,
      assignment_kind: "primary",
    });
  });
  return organizationId;
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  for (const afterRequest of [false, true]) {
    const failure = afterRequest ? "lost-ack" : "pre-write";
    test(`${failure} contextual message recovery at ${viewport.width}`, async ({
      athleteActor,
      athletePage,
      coachActor,
      coachPage: page,
      e2eDatabase,
      e2eIdentity,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const organizationId = await seedCoachAssignment({
        athletePage,
        athleteId: athleteActor.profileId,
        coachId: coachActor.profileId,
        e2eDatabase,
        e2eIdentity,
      });
      const returnTo = `/organizations/${organizationId}/athletes/${athleteActor.profileId}`;
      await page.goto(returnTo);
      await waitForAppHydration(page);
      await page.getByRole("link", { name: "Message athlete" }).click();
      await expect(page.getByRole("heading", { name: "New message" })).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: `Remove @${athleteActor.username} from recipients`,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Start conversation", exact: true }).click();
      const composer = page.getByPlaceholder("Type a message...");
      const send = page.getByRole("button", { name: "Send message", exact: true });
      const returnLink = page.getByRole("link", { name: "Return to athlete workspace" });
      await expect(composer).toBeVisible();
      const conversationId = new URL(page.url()).searchParams.get("conversationId");
      if (!conversationId) throw new Error("Expected a direct conversation ID");
      const header = page.getByText(`@${athleteActor.username}`, { exact: true });
      const thread = header.locator("..").locator("..").locator("..").locator("..");
      const assertContext = async () => {
        const url = new URL(page.url());
        expect(url.pathname).toBe("/messages");
        expect(url.searchParams.get("conversationId")).toBe(conversationId);
        expect(url.searchParams.get("returnTo")).toBe(returnTo);
        await expect(header).toBeVisible();
        await expect(returnLink).toHaveAttribute("href", returnTo);
        await expectNoHorizontalOverflow(page);
        for (const control of [returnLink, composer, send]) await expectUsable(control);
      };
      await assertContext();
      const participants = await e2eDatabase.db
        .select({ userId: conversationParticipants.user_id })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversation_id, conversationId));
      expect(participants.map((row) => row.userId).sort()).toEqual(
        [athleteActor.profileId, coachActor.profileId].sort(),
      );
      expect(
        await e2eDatabase.db
          .select({ id: conversations.id, isGroup: conversations.is_group })
          .from(conversations)
          .where(eq(conversations.id, conversationId)),
      ).toEqual([{ id: conversationId, isGroup: false }]);
      const draft = e2eIdentity.name(`${failure}-${viewport.width}`);
      const readMessages = () =>
        e2eDatabase.db.select().from(messages).where(eq(messages.conversation_id, conversationId));
      const expectedRow = expect.objectContaining({
        id: expect.any(String),
        conversation_id: conversationId,
        sender_id: coachActor.profileId,
        content: draft,
      });
      expect(await readMessages()).toEqual([]);
      await composer.fill(draft);
      await withTrpcFailure(
        page,
        "messaging.sendMessage",
        async ({ calls }) => {
          await send.click();
          await expect(page.getByRole("alert")).toContainText(
            "Your message is still in the field.",
          );
          await expect(composer).toHaveValue(draft);
          await expect(send).toBeEnabled();
          expect(calls()).toBe(1);
          await assertContext();
          expect(await readMessages()).toEqual(afterRequest ? [expectedRow] : []);
          await capture(page, testInfo, `${failure}-${viewport.width}-failure`);
        },
        { afterRequest, times: 1 },
      );
      await send.click();
      await expect(composer).toHaveValue("");
      expect(await readMessages()).toEqual([expectedRow]);
      await expect(thread.getByText(draft, { exact: true })).toHaveCount(1);
      await expect(thread.getByText(draft, { exact: true })).toBeVisible();
      await assertContext();
      await capture(page, testInfo, `${failure}-${viewport.width}-success`);
      await page.reload();
      await waitForAppHydration(page);
      await expect(thread.getByText(draft, { exact: true })).toHaveCount(1);
      await expect(thread.getByText(draft, { exact: true })).toBeVisible();
      expect(await readMessages()).toEqual([expectedRow]);
      await assertContext();
      await returnLink.click();
      await expect(page).toHaveURL(returnTo);
      await expect(page.getByRole("link", { name: "Message athlete" })).toBeVisible();
      await capture(page, testInfo, `${failure}-${viewport.width}-return`);
    });
  }
}
