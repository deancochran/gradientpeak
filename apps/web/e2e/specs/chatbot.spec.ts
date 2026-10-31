import type { Page } from "@playwright/test";
import {
  activities,
  chatbotActions,
  chatbotThreads,
  chatbotTurns,
  profiles,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { expect, test } from "../fixtures";

async function openAssistant(page: Page) {
  await page.getByRole("button", { name: "Assistant" }).click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
}

async function expectComposerInsideViewport(page: Page) {
  const composer = page.getByTestId("chat-composer");
  // Sheet uses a 500ms entrance transition. Visibility is intentionally earlier
  // than its final geometry, so wait for the rendered viewport contract rather
  // than sampling the transform's intermediate position.
  await expect
    .poll(async () => {
      const box = await composer.boundingBox();
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      return Boolean(box && box.x >= 0 && box.x + box.width <= viewportWidth);
    })
    .toBe(true);
}

test("authenticated athlete completes and restores a durable assistant conversation", async ({
  athleteActor,
  e2eDatabase,
}) => {
  const page = await athleteActor.createPage("/");
  await openAssistant(page);
  const composer = page.getByTestId("chat-composer");
  await composer.fill("acceptance: complete");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Acceptance response complete.", { exact: true })).toBeVisible();

  await composer.fill("draft retained while closed");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("chat-panel")).toBeHidden();
  await openAssistant(page);
  await expect(composer).toHaveValue("draft retained while closed");
  await expectComposerInsideViewport(page);

  const [thread] = await e2eDatabase.db
    .select({ id: chatbotThreads.id, profileId: chatbotThreads.profile_id })
    .from(chatbotThreads)
    .where(eq(chatbotThreads.profile_id, athleteActor.profileId));
  expect(thread).toMatchObject({ profileId: athleteActor.profileId });
  if (!thread) throw new Error("Assistant UI did not persist an owned thread.");
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({
          status: chatbotTurns.status,
          input: chatbotTurns.input,
          output: chatbotTurns.output,
        })
        .from(chatbotTurns)
        .where(eq(chatbotTurns.thread_id, thread.id)),
    )
    .toEqual([
      {
        status: "completed",
        input: { role: "user", text: "acceptance: complete" },
        output: { role: "assistant", text: "Acceptance response complete." },
      },
    ]);

  await page.reload();
  await openAssistant(page);
  await expect(page.getByText("acceptance: complete", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Acceptance response complete.", { exact: true })).toHaveCount(1);
});

test("recovery replays one durable tool receipt without a replacement model turn", async ({
  athleteActor,
  athletePage: page,
  e2eDatabase,
}) => {
  // Synthetic actor prerequisite, not the mutation under test. The standard
  // actor fixture has no planning timezone; diary writes correctly require one.
  // No activity, chat turn, action, or receipt is seeded here.
  await e2eDatabase.db
    .update(profiles)
    .set({ planning_timezone: "UTC" })
    .where(eq(profiles.id, athleteActor.profileId));
  await openAssistant(page);
  await page.getByTestId("chat-composer").fill("acceptance: action recovery");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Acceptance action is streaming", { exact: true })).toBeVisible();

  const [thread] = await e2eDatabase.db
    .select({ id: chatbotThreads.id })
    .from(chatbotThreads)
    .where(eq(chatbotThreads.profile_id, athleteActor.profileId));
  if (!thread) throw new Error("Action-recovery request did not create an owned thread.");

  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ actionId: chatbotActions.action_id, status: chatbotActions.status })
        .from(chatbotActions)
        .innerJoin(chatbotTurns, eq(chatbotActions.turn_id, chatbotTurns.id))
        .where(eq(chatbotTurns.thread_id, thread.id)),
    )
    .toEqual([{ actionId: expect.any(String), status: "completed" }]);
  const [before] = await e2eDatabase.db
    .select({
      actionId: chatbotActions.action_id,
      result: chatbotActions.result,
      turnId: chatbotTurns.id,
    })
    .from(chatbotActions)
    .innerJoin(chatbotTurns, eq(chatbotActions.turn_id, chatbotTurns.id))
    .where(eq(chatbotTurns.thread_id, thread.id));
  if (!before) throw new Error("Action-recovery request did not persist a tool receipt.");

  await page.getByTestId("chat-stop").click();
  await expect(page.getByTestId("chat-status")).toHaveText("Response interrupted");
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ status: chatbotTurns.status })
        .from(chatbotTurns)
        .where(eq(chatbotTurns.id, before.turnId)),
    )
    .toEqual([{ status: "interrupted" }]);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("button", { name: "Recover request" })).toBeVisible();
  await page.getByTestId("chat-recovery").click();
  await expect(page.getByText("Recovered 1 recorded action", { exact: false })).toBeVisible();

  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ actionId: chatbotActions.action_id, status: chatbotActions.status })
        .from(chatbotActions)
        .where(eq(chatbotActions.action_id, before.actionId)),
    )
    .toEqual([{ actionId: before.actionId, status: "completed" }]);
  expect(
    await e2eDatabase.db
      .select({ id: chatbotTurns.id, output: chatbotTurns.output })
      .from(chatbotTurns)
      .where(eq(chatbotTurns.thread_id, thread.id)),
  ).toEqual([
    {
      id: before.turnId,
      output: expect.objectContaining({
        text: expect.stringContaining("No new response was generated."),
      }),
    },
  ]);
  expect(
    await e2eDatabase.db
      .select({ actionId: chatbotActions.action_id, result: chatbotActions.result })
      .from(chatbotActions)
      .where(eq(chatbotActions.action_id, before.actionId)),
  ).toEqual([{ actionId: before.actionId, result: before.result }]);
  expect(
    await e2eDatabase.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(
        and(
          eq(activities.profile_id, athleteActor.profileId),
          eq(activities.name, "Acceptance recovery run"),
        ),
      ),
  ).toEqual([{ count: 1 }]);
});

test("stopped streaming turn is interrupted, recoverable, and private to its actor", async ({
  athleteActor,
  athletePage: page,
  coachActor,
  e2eDatabase,
}) => {
  await openAssistant(page);
  await page.getByTestId("chat-composer").fill("acceptance: slow");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Acceptance response is streaming", { exact: true })).toBeVisible();
  await page.getByTestId("chat-stop").click();
  await expect(page.getByTestId("chat-status")).toHaveText("Response interrupted");
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("button", { name: "Recover request" })).toBeVisible();

  const [thread] = await e2eDatabase.db
    .select({ id: chatbotThreads.id })
    .from(chatbotThreads)
    .where(eq(chatbotThreads.profile_id, athleteActor.profileId));
  if (!thread) throw new Error("Stopped assistant UI request did not persist its owned thread.");
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ id: chatbotTurns.id, status: chatbotTurns.status })
        .from(chatbotTurns)
        .where(eq(chatbotTurns.thread_id, thread.id)),
    )
    .toHaveLength(1);
  const denied = await coachActor.request.get(`/api/chat?threadId=${thread.id}`);
  expect(denied.status()).toBe(404);

  await page.getByTestId("chat-recovery").click();
  await expect(page.getByText("Recovered 0 recorded actions", { exact: false })).toBeVisible();
  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({ status: chatbotTurns.status })
        .from(chatbotTurns)
        .where(and(eq(chatbotTurns.thread_id, thread.id), eq(chatbotTurns.status, "completed"))),
    )
    .toHaveLength(1);
  expect(
    await e2eDatabase.db
      .select({ id: chatbotTurns.id })
      .from(chatbotTurns)
      .where(eq(chatbotTurns.thread_id, thread.id)),
  ).toHaveLength(1);
});
