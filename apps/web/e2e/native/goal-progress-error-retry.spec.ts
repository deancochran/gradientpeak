import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { activities, profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { createGoalProgressFixture } from "../support/goal-progress-fixture";
import { startNativeGoalTransport } from "../support/native-goal-transport";
import {
  requireNativeReverseRestoration,
  runWithNativeScenarioCleanup,
} from "../support/native-scenario-cleanup";

const captures = {
  "goal-progress-sign-in.yaml": ["goal-progress-home"],
  "goal-progress-retry-blocked-workspace.yaml": ["goal-progress-retry-blocked"],
  "goal-progress-retry-recovery.yaml": [
    "goal-progress-retry-recovered",
    "goal-progress-retry-source",
    "goal-progress-retry-back",
  ],
} as const;

type Flow = keyof typeof captures;

function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function monthsBetween(from: string, to: string) {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("Android truthfully retries a blocked cached goal-progress refresh", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const actor = await actorFactory.create("coach", { label: "native-goal-progress-retry" });
  const targetDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel)
    throw new Error(
      "Native goal-progress retry proof requires the runner-provided runtime sentinel.",
    );

  const flow = (name: Flow, environment: Record<string, string>) => {
    const debug = testInfo.outputPath("maestro", name.replace(".yaml", ""));
    const retained = testInfo.outputPath("goal-progress-retry-screenshots");
    mkdirSync(debug, { recursive: true });
    mkdirSync(retained, { recursive: true });
    for (const screenshot of captures[name]) {
      rmSync(join(debug, `${screenshot}.png`), { force: true });
      rmSync(join(process.cwd(), `${screenshot}.png`), { force: true });
      rmSync(join(retained, `${screenshot}.png`), { force: true });
    }
    const result = spawnSync(
      "maestro",
      [
        "--udid",
        "emulator-5554",
        "test",
        "--debug-output",
        debug,
        `../mobile/.maestro/flows/acceptance/${name}`,
      ],
      { encoding: "utf8", timeout: 180_000, env: { ...process.env, ...environment } },
    );
    for (const screenshot of captures[name]) {
      for (const source of [
        join(debug, `${screenshot}.png`),
        join(process.cwd(), `${screenshot}.png`),
      ]) {
        if (!existsSync(source)) continue;
        copyFileSync(source, join(retained, `${screenshot}.png`));
        break;
      }
    }
    writeFileSync(
      testInfo.outputPath(`maestro-${name.replace(".yaml", "")}.log`),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600 },
    );
    expect(result.error, `Maestro must execute ${name}`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${name}`).toBe(0);
    expect(
      captures[name].every((screenshot) => existsSync(join(retained, `${screenshot}.png`))),
    ).toBe(true);
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
  const page = await actor.createPage("/");
  const title = e2eIdentity.name("Native retry bike threshold goal");

  await withGoalFixture(
    async (fixture) => {
      const goals = new GoalsPage(page);
      await goals.startCreate(targetDate);
      const form = page.getByTestId("goal-form");
      await form.getByLabel("Title").fill(title);
      await chooseAuthoringOption(page, "Goal type", "Power threshold");
      await form.getByLabel("Watts").fill("300");
      await form.getByLabel("Test duration").fill("0:30:00");
      fixture.rememberGoalTitle(title);
      await form.getByTestId("goal-submit").click();
      const card = page.locator('[data-testid^="goal-card-"]').filter({ hasText: title });
      const cardId = await card.getAttribute("data-testid");
      if (!cardId) throw new Error("The retry fixture goal card did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);
      await evidence.assertReadModels(goalId);

      const deviceDate = spawnSync("adb", ["-s", "emulator-5554", "shell", "date", "+%Y-%m-%d"], {
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(deviceDate.status).toBe(0);
      const today = deviceDate.stdout.trim();
      if (!dateOnly(today))
        throw new Error("The designated emulator returned an invalid local date.");
      const targetMonthDelta = monthsBetween(today, targetDate);
      if (targetMonthDelta < 1 || targetMonthDelta > 3)
        throw new Error("The canonical +60-day retry target must be 1-3 months from device today.");
      const environment = {
        MAESTRO_ACCEPTANCE_DEVICE_TODAY_DATE: today,
        MAESTRO_ACCEPTANCE_EMAIL: actor.email,
        MAESTRO_ACCEPTANCE_GOAL_ID: goalId,
        MAESTRO_ACCEPTANCE_GOAL_TITLE: title,
        MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
        MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL: runtimeSentinel,
        MAESTRO_ACCEPTANCE_SOURCE_ACTIVITY_ID: evidence.activityId,
        MAESTRO_ACCEPTANCE_SOURCE_ACTIVITY_NAME: evidence.activityName,
        MAESTRO_ACCEPTANCE_TARGET_DATE: targetDate,
        MAESTRO_ACCEPTANCE_TARGET_MONTH_DELTA: String(targetMonthDelta),
      };

      // Preload the real successful Home query before installing the 503 transport.
      // The blocked goal read must therefore show the product's cached-refresh warning.
      flow("goal-progress-sign-in.yaml", environment);
      const transport = await startNativeGoalTransport({ goalId });
      const port = new URL(transport.origin).port;
      let trace: Awaited<ReturnType<typeof transport.trace>> | undefined;
      let traceError: unknown;
      await runWithNativeScenarioCleanup(
        async () => {
          try {
            expect(
              spawnSync("adb", ["-s", "emulator-5554", "reverse", "--remove", "tcp:3100"], {
                encoding: "utf8",
                timeout: 30_000,
              }).status,
            ).toBe(0);
            expect(
              spawnSync("adb", ["-s", "emulator-5554", "reverse", "tcp:3100", `tcp:${port}`], {
                encoding: "utf8",
                timeout: 30_000,
              }).status,
            ).toBe(0);
            flow("goal-progress-retry-blocked-workspace.yaml", environment);
            expect((await transport.observations()).blocked).toBeGreaterThan(0);
            await transport.allowProgressReads();
            flow("goal-progress-retry-recovery.yaml", environment);
          } finally {
            try {
              trace = await transport.trace();
              writeFileSync(
                testInfo.outputPath("native-goal-transport-retry-trace.json"),
                `${JSON.stringify(trace, null, 2)}\n`,
                { mode: 0o600 },
              );
            } catch (error) {
              traceError = error;
            }
          }
        },
        {
          restoreReverse: () =>
            requireNativeReverseRestoration(
              spawnSync("adb", ["-s", "emulator-5554", "reverse", "tcp:3100", "tcp:3100"], {
                encoding: "utf8",
                timeout: 30_000,
              }),
            ),
          stopTransport: () => transport.stop(),
        },
      );
      if (traceError) throw traceError;
      if (!trace) throw new Error("Native goal retry transport trace was not retained.");
      expect(
        trace.some(
          (record) => record.hasProgress && record.targetGoalMatched && record.status === 503,
        ),
      ).toBe(true);
      expect(
        trace.some(
          (record) => record.hasProgress && record.targetGoalMatched && record.status === 200,
        ),
      ).toBe(true);
    },
    { profileId: actor.profileId },
  );
});
