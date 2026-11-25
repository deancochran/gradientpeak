import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";
import { activities, profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { createGoalProgressFixture } from "../support/goal-progress-fixture";

const flowScreenshots = {
  "goal-progress-sign-in.yaml": ["goal-progress-home"],
  "goal-progress-workspace.yaml": [
    "goal-progress-plan-context",
    "goal-progress-plan-selected-date",
    "goal-progress-goal-context",
    "goal-progress-source-context",
  ],
} as const;

function maestroDebugDirectory(testInfo: TestInfo, flow: keyof typeof flowScreenshots) {
  return testInfo.outputPath("maestro", flow.replace(".yaml", ""));
}

function screenshotPath(root: string, name: string) {
  return join(root, `${name}.png`);
}

function retainFlowScreenshots(
  testInfo: TestInfo,
  flow: keyof typeof flowScreenshots,
  debugDirectory: string,
) {
  const retained: string[] = [];
  const artifactDirectory = testInfo.outputPath("goal-progress-screenshots");
  mkdirSync(artifactDirectory, { recursive: true });

  for (const name of flowScreenshots[flow]) {
    const destination = screenshotPath(artifactDirectory, name);
    for (const source of [
      screenshotPath(debugDirectory, name),
      screenshotPath(process.cwd(), name),
    ]) {
      if (!existsSync(source)) continue;
      copyFileSync(source, destination);
      retained.push(name);
      break;
    }
  }
  return retained;
}

function prepareFlowScreenshots(
  testInfo: TestInfo,
  flow: keyof typeof flowScreenshots,
  debugDirectory: string,
) {
  mkdirSync(debugDirectory, { recursive: true });
  for (const name of flowScreenshots[flow]) {
    rmSync(screenshotPath(debugDirectory, name), { force: true });
    rmSync(screenshotPath(process.cwd(), name), { force: true });
    rmSync(testInfo.outputPath("goal-progress-screenshots", `${name}.png`), { force: true });
  }
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function monthDelta(fromDate: string, toDate: string) {
  return (
    (Number(toDate.slice(0, 4)) - Number(fromDate.slice(0, 4))) * 12 +
    Number(toDate.slice(5, 7)) -
    Number(fromDate.slice(5, 7))
  );
}

test("Android shows canonical published threshold evidence through the goal and selected Plan day", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const actor = await actorFactory.create("athlete", { label: "native-goal-progress-athlete" });
  const fixtureNow = new Date();
  const targetDate = new Date(fixtureNow.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const title = e2eIdentity.name("Native observed bike threshold goal");
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel)
    throw new Error(
      "Native goal-progress proof requires the runner-provided MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL.",
    );
  const runMaestro = (
    flow: keyof typeof flowScreenshots,
    environment: Record<string, string>,
    debugDirectory: string,
  ) =>
    spawnSync(
      "maestro",
      [
        "--udid",
        "emulator-5554",
        "test",
        "--debug-output",
        debugDirectory,
        `../mobile/.maestro/flows/acceptance/${flow}`,
      ],
      {
        encoding: "utf8",
        timeout: 180_000,
        env: { ...process.env, ...environment },
      },
    );
  const readDeviceToday = () => {
    const result = spawnSync("adb", ["-s", "emulator-5554", "shell", "date", "+%Y-%m-%d"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(
      result.error,
      "The designated emulator must provide its local calendar date",
    ).toBeUndefined();
    expect(result.status, "The designated emulator date query must succeed").toBe(0);
    const deviceToday = result.stdout.trim();
    if (!isDateOnly(deviceToday))
      throw new Error(
        `The designated emulator returned an invalid local date: ${JSON.stringify(deviceToday)}.`,
      );
    return deviceToday;
  };
  const runFlow = (
    flow: keyof typeof flowScreenshots,
    environment: Record<string, string>,
    output: string,
  ) => {
    const debugDirectory = maestroDebugDirectory(testInfo, flow);
    prepareFlowScreenshots(testInfo, flow, debugDirectory);
    let result: ReturnType<typeof runMaestro> | undefined;
    let retained: string[] = [];
    try {
      result = runMaestro(flow, environment, debugDirectory);
    } finally {
      // Retain captures before reporting the flow result so a failing assertion
      // cannot let runner cleanup discard the screenshots already produced.
      retained = retainFlowScreenshots(testInfo, flow, debugDirectory);
    }
    if (!result) throw new Error(`Maestro did not return a result for ${flow}.`);
    writeFileSync(testInfo.outputPath(output), `${result.stdout ?? ""}\n${result.stderr ?? ""}`, {
      mode: 0o600,
    });
    expect(result.error, `Maestro must execute ${flow} on the designated emulator`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${flow}`).toBe(0);
    expect(retained, `Successful ${flow} must retain its declared screenshots`).toEqual([
      ...flowScreenshots[flow],
    ]);
  };

  await e2eDatabase.db
    .update(profiles)
    .set({ planning_timezone: "UTC" })
    .where(eq(profiles.id, actor.profileId));
  expect(
    await e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, actor.profileId)),
  ).toEqual([]);

  const evidence = await createGoalProgressFixture({
    actor,
    database: e2eDatabase,
    identity: e2eIdentity,
  });
  const athletePage = await actor.createPage("/");
  await withGoalFixture(
    async (fixture) => {
      const goals = new GoalsPage(athletePage);
      await goals.startCreate(targetDate);
      const form = athletePage.getByTestId("goal-form");
      await form.getByLabel("Title").fill(title);
      await chooseAuthoringOption(athletePage, "Goal type", "Power threshold");
      await form.getByLabel("Watts").fill("300");
      await form.getByLabel("Test duration").fill("0:30:00");
      fixture.rememberGoalTitle(title);
      await form.getByTestId("goal-submit").click();

      const card = athletePage.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
      await expect(card).toBeVisible();
      const cardId = await card.getAttribute("data-testid");
      if (!cardId) throw new Error("The fixture goal card did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);
      await evidence.assertReadModels(goalId);
      expect(
        await e2eDatabase.db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.profile_id, actor.profileId)),
      ).toEqual([{ id: evidence.activityId }]);

      const deviceToday = readDeviceToday();
      const targetMonthDelta = monthDelta(deviceToday, targetDate);
      if (targetMonthDelta < 1 || targetMonthDelta > 3)
        throw new Error(
          `The canonical +60-day target (${targetDate}) is ${targetMonthDelta} months from the emulator local date (${deviceToday}); expected 1-3 months.`,
        );
      const environment = {
        MAESTRO_ACCEPTANCE_DEVICE_TODAY_DATE: deviceToday,
        MAESTRO_ACCEPTANCE_EMAIL: actor.email,
        MAESTRO_ACCEPTANCE_GOAL_ID: goalId,
        MAESTRO_ACCEPTANCE_GOAL_TITLE: title,
        MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
        MAESTRO_ACCEPTANCE_SOURCE_ACTIVITY_ID: evidence.activityId,
        MAESTRO_ACCEPTANCE_SOURCE_ACTIVITY_NAME: evidence.activityName,
        MAESTRO_ACCEPTANCE_TARGET_DATE: targetDate,
        MAESTRO_ACCEPTANCE_TARGET_MONTH_DELTA: String(targetMonthDelta),
      };
      runFlow("goal-progress-sign-in.yaml", environment, "maestro-goal-progress-sign-in.log");
      runFlow("goal-progress-workspace.yaml", environment, "maestro-goal-progress-workspace.log");
    },
    { profileId: actor.profileId },
  );
});
