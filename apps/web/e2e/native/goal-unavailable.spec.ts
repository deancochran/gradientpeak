import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";
import { readGoalProgress } from "@repo/api/test-support/activity-evidence-acceptance";
import { activities, profiles, thresholdEvaluations, thresholds } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";

const flowScreenshots = {
  "goal-progress-unavailable-sign-in.yaml": ["goal-progress-unavailable-home"],
  "goal-progress-unavailable-workspace.yaml": [
    "goal-progress-unavailable-plan",
    "goal-progress-unavailable-goal",
    "goal-progress-unavailable-back",
  ],
} as const;

function screenshotPath(root: string, name: string) {
  return join(root, `${name}.png`);
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
    rmSync(testInfo.outputPath("goal-progress-unavailable-screenshots", `${name}.png`), {
      force: true,
    });
  }
}

function retainFlowScreenshots(
  testInfo: TestInfo,
  flow: keyof typeof flowScreenshots,
  debugDirectory: string,
) {
  const retained: string[] = [];
  const artifactDirectory = testInfo.outputPath("goal-progress-unavailable-screenshots");
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

test("Android keeps an evidence-free threshold goal available without inventing progress", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  // The completed role has no seeded activities or threshold records. Unlike the
  // published-evidence journey, this flow must remain cold throughout.
  const actor = await actorFactory.create("coach", { label: "native-goal-progress-unavailable" });
  const targetDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const title = e2eIdentity.name("Native evidence-free bike threshold goal");
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel)
    throw new Error(
      "Native unavailable-progress proof requires the runner-provided MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL.",
    );

  const runFlow = (
    flow: keyof typeof flowScreenshots,
    environment: Record<string, string>,
    output: string,
  ) => {
    const debugDirectory = testInfo.outputPath("maestro", flow.replace(".yaml", ""));
    prepareFlowScreenshots(testInfo, flow, debugDirectory);
    let result: ReturnType<typeof spawnSync> | undefined;
    let retained: string[] = [];
    try {
      result = spawnSync(
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
    } finally {
      // Keep any fresh device evidence before a failing Maestro assertion or the
      // disposable runner can clean its temporary working directory.
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
  const evidenceBeforeGoal = await Promise.all([
    e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, actor.profileId)),
    e2eDatabase.db
      .select({ id: thresholds.id })
      .from(thresholds)
      .where(eq(thresholds.profile_id, actor.profileId)),
    e2eDatabase.db
      .select({ id: thresholdEvaluations.id })
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.profile_id, actor.profileId)),
  ]);
  expect(evidenceBeforeGoal).toEqual([[], [], []]);

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
      if (!cardId) throw new Error("The cold fixture goal card did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);

      const progress = await readGoalProgress({
        db: e2eDatabase.db,
        profileId: actor.profileId,
        goalId,
      });
      expect(progress.result.status).toBe("insufficient");
      if (progress.result.status !== "insufficient")
        throw new Error("An evidence-free threshold goal must return insufficient progress.");
      expect(progress.result.current).toBeNull();
      expect(progress.result.metrics.remainingGap).toBeNull();
      expect(progress.result.target.targetValue).toBe(300);
      expect(progress.provenance).toEqual({ baseline: null, current: null });
      expect(
        await e2eDatabase.db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.profile_id, actor.profileId)),
      ).toEqual([]);

      const environment = {
        MAESTRO_ACCEPTANCE_EMAIL: actor.email,
        MAESTRO_ACCEPTANCE_GOAL_ID: goalId,
        MAESTRO_ACCEPTANCE_GOAL_TITLE: title,
        MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
        MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL: runtimeSentinel,
        MAESTRO_ACCEPTANCE_TARGET_DATE: targetDate,
      };
      runFlow(
        "goal-progress-unavailable-sign-in.yaml",
        environment,
        "maestro-goal-progress-unavailable-sign-in.log",
      );
      runFlow(
        "goal-progress-unavailable-workspace.yaml",
        environment,
        "maestro-goal-progress-unavailable-workspace.log",
      );
    },
    { profileId: actor.profileId },
  );
});
