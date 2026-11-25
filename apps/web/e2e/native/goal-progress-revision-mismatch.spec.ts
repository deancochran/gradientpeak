import { spawnSync } from "node:child_process";
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

const flows = [
  "goal-progress-revision-initial.yaml",
  "goal-progress-revision-mismatch.yaml",
  "goal-progress-revision-recovered.yaml",
] as const;

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

test("Android withholds only stale threshold history after a real publication advance", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}) => {
  test.setTimeout(600_000);
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel)
    throw new Error(
      "Native revision-mismatch proof requires the runner-provided runtime sentinel.",
    );
  const actor = await actorFactory.create("coach", { label: "native-goal-revision-mismatch" });
  const targetDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const evidence = await createGoalProgressFixture({
    actor,
    database: e2eDatabase,
    identity: e2eIdentity,
  });
  const page = await actor.createPage("/");
  const deviceDate = spawnSync("adb", ["-s", "emulator-5554", "shell", "date", "+%Y-%m-%d"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(deviceDate.status).toBe(0);
  const today = deviceDate.stdout.trim();
  if (!dateOnly(today)) throw new Error("The designated emulator returned an invalid local date.");
  const targetMonthDelta = monthsBetween(today, targetDate);
  if (targetMonthDelta < 1 || targetMonthDelta > 3)
    throw new Error("The canonical +60-day target must be 1-3 months from device today.");

  await withGoalFixture(
    async (fixture) => {
      const goals = new GoalsPage(page);
      const title = e2eIdentity.name("Native revision mismatch threshold goal");
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
      if (!cardId) throw new Error("The revision-mismatch fixture goal did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);
      await evidence.assertReadModels(goalId);

      const transport = await startNativeGoalTransport({
        faultMode: "replay-stale-history",
        goalId,
      });
      const flow = (name: (typeof flows)[number], environment: Record<string, string>) => {
        const result = spawnSync(
          "maestro",
          ["--udid", "emulator-5554", "test", `../mobile/.maestro/flows/acceptance/${name}`],
          { encoding: "utf8", timeout: 180_000, env: { ...process.env, ...environment } },
        );
        expect(result.error, `Maestro must execute ${name}`).toBeUndefined();
        expect(result.status, `See private Maestro output for ${name}`).toBe(0);
      };
      const environment = {
        MAESTRO_ACCEPTANCE_DEVICE_TODAY_DATE: today,
        MAESTRO_ACCEPTANCE_EMAIL: actor.email,
        MAESTRO_ACCEPTANCE_GOAL_ID: goalId,
        MAESTRO_ACCEPTANCE_GOAL_TITLE: title,
        MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
        MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL: runtimeSentinel,
        MAESTRO_ACCEPTANCE_TARGET_DATE: targetDate,
        MAESTRO_ACCEPTANCE_TARGET_MONTH_DELTA: String(targetMonthDelta),
      };
      const port = new URL(transport.origin).port;
      await runWithNativeScenarioCleanup(
        async () => {
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
          await transport.captureStaleHistory();
          flow("goal-progress-revision-initial.yaml", environment);
          await transport.replayStaleHistory();
          const transition = await evidence.advancePublication(goalId);
          expect(transition.publishedRevision).toBeGreaterThan(
            transition.previousPublishedRevision,
          );
          expect(transition.nextProgress.publication?.publishedRevision).toBe(
            transition.nextOverview.publication.publishedRevision,
          );
          if (transition.nextProgress.result.status === "unsupported")
            throw new Error(
              "The publication transition unexpectedly produced unsupported progress.",
            );
          const current = transition.nextProgress.result.current;
          const source = transition.nextProgress.provenance?.current?.sourceActivities.find(
            (item) => item.id === transition.activityId,
          );
          if (!current || !source)
            throw new Error(
              "The publication transition did not expose its authoritative current source.",
            );
          const newEnvironment = {
            ...environment,
            MAESTRO_ACCEPTANCE_NEW_CURRENT_LABEL: `Current: ${current.value} W`,
            MAESTRO_ACCEPTANCE_NEW_SOURCE_ACTIVITY_ID: source.id,
            MAESTRO_ACCEPTANCE_NEW_SOURCE_ACTIVITY_NAME: source.name,
          };
          flow("goal-progress-revision-mismatch.yaml", newEnvironment);
          await transport.releaseStaleHistory();
          flow("goal-progress-revision-recovered.yaml", newEnvironment);
          const trace = await transport.trace();
          expect(trace.some((record) => record.captureSequence === 1)).toBe(true);
          expect(trace.some((record) => record.replayedHistory && record.status === 200)).toBe(
            true,
          );
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
    },
    { profileId: actor.profileId },
  );
});
