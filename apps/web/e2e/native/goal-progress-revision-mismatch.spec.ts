import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";
import { formatGoalGap } from "@repo/ui/lib/goal-progress-presentation";
import { expect, test } from "../fixtures";
import { GoalsPage } from "../pages";
import { chooseAuthoringOption } from "../pages/authoring";
import { withGoalFixture } from "../planning/data";
import { createGoalProgressFixture } from "../support/goal-progress-fixture";
import {
  type NativeGoalTransportTrace,
  startNativeGoalTransport,
} from "../support/native-goal-transport";
import {
  requireNativeReverseRestoration,
  runWithNativeScenarioCleanup,
} from "../support/native-scenario-cleanup";

const captures = {
  "goal-progress-revision-initial.yaml": ["goal-progress-revision-initial"],
  "goal-progress-revision-mismatch.yaml": ["goal-progress-revision-mismatch"],
  "goal-progress-revision-recovered.yaml": ["goal-progress-revision-recovered"],
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

function prepareFlowCaptures(testInfo: TestInfo, flow: Flow) {
  const debug = testInfo.outputPath("maestro", flow.replace(".yaml", ""));
  const retained = testInfo.outputPath("goal-progress-revision-screenshots");
  mkdirSync(debug, { recursive: true });
  mkdirSync(retained, { recursive: true });
  for (const screenshot of captures[flow]) {
    rmSync(join(debug, `${screenshot}.png`), { force: true });
    rmSync(join(process.cwd(), `${screenshot}.png`), { force: true });
    rmSync(join(retained, `${screenshot}.png`), { force: true });
  }
  return { debug, retained };
}

function retainFlowCaptures(flow: Flow, debug: string, retained: string) {
  const retainedCaptures: string[] = [];
  for (const screenshot of captures[flow]) {
    for (const source of [
      join(debug, `${screenshot}.png`),
      join(process.cwd(), `${screenshot}.png`),
    ]) {
      if (!existsSync(source)) continue;
      copyFileSync(source, join(retained, `${screenshot}.png`));
      retainedCaptures.push(screenshot);
      break;
    }
  }
  return retainedCaptures;
}

function targetBatch(trace: NativeGoalTransportTrace[], afterRequestOrder = 0) {
  return trace.find(
    (record) =>
      record.requestOrder > afterRequestOrder &&
      record.method === "GET" &&
      record.status === 200 &&
      record.targetGoalMatched &&
      record.procedures.join(",") ===
        "goals.getById,athleteIntelligence.getGoalAssessment,athleteIntelligence.getGoalProgress,athleteIntelligence.getThresholdOverview",
  );
}

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("Android withholds only stale threshold history after a real publication advance", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
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
      const title = e2eIdentity.name("Native revision mismatch threshold goal");
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
      if (!cardId) throw new Error("The revision-mismatch fixture goal did not expose an ID.");
      const goalId = cardId.replace("goal-card-", "");
      fixture.rememberGoal(goalId);
      await evidence.assertReadModels(goalId);

      const transport = await startNativeGoalTransport({
        faultMode: "replay-stale-history",
        goalId,
      });
      const flow = (name: Flow, environment: Record<string, string>) => {
        const { debug, retained } = prepareFlowCaptures(testInfo, name);
        let result: ReturnType<typeof spawnSync> | undefined;
        let retainedCaptures: string[] = [];
        try {
          result = spawnSync(
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
        } finally {
          retainedCaptures = retainFlowCaptures(name, debug, retained);
        }
        if (!result) throw new Error(`Maestro did not return a result for ${name}.`);
        writeFileSync(
          testInfo.outputPath(`maestro-${name.replace(".yaml", "")}.log`),
          `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
          { mode: 0o600 },
        );
        expect(result.error, `Maestro must execute ${name}`).toBeUndefined();
        expect(result.status, `See private Maestro output for ${name}`).toBe(0);
        expect(retainedCaptures, `Successful ${name} must retain its declared screenshots`).toEqual(
          [...captures[name]],
        );
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
      const phaseMarkers: Array<{
        phase: "capture" | "replay" | "release";
        requestOrder: number;
        responseOrder: number | undefined;
        replayedHistory: boolean | undefined;
        captureSequence: number | undefined;
      }> = [];
      let trace: NativeGoalTransportTrace[] | undefined;
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
            await transport.captureStaleHistory();
            flow("goal-progress-revision-initial.yaml", environment);
            const captured = targetBatch(await transport.trace());
            expect(captured).toMatchObject({ captureSequence: 1, replayedHistory: undefined });
            if (!captured) throw new Error("The initial target batch was not captured.");
            phaseMarkers.push({
              phase: "capture",
              requestOrder: captured.requestOrder,
              responseOrder: captured.responseOrder,
              replayedHistory: captured.replayedHistory,
              captureSequence: captured.captureSequence,
            });

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
            if (
              transition.nextProgress.result.target.activityCategory !== "bike" ||
              transition.nextProgress.result.target.unit !== "watts"
            )
              throw new Error(
                "The fixture no longer matches the Power threshold display contract.",
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
              MAESTRO_ACCEPTANCE_NEW_CURRENT_ACCESSIBILITY_LABEL: `Current: ${Math.round(current.value)} W`,
              MAESTRO_ACCEPTANCE_NEW_TARGET_ACCESSIBILITY_LABEL: `Target: ${Math.round(transition.nextProgress.result.target.targetValue)} W`,
              MAESTRO_ACCEPTANCE_NEW_GAP_ACCESSIBILITY_LABEL: `Remaining gap: ${formatGoalGap(transition.nextProgress.result)}`,
              MAESTRO_ACCEPTANCE_NEW_SOURCE_ACTIVITY_ID: source.id,
              MAESTRO_ACCEPTANCE_NEW_SOURCE_ACTIVITY_NAME: source.name,
            };
            flow("goal-progress-revision-mismatch.yaml", newEnvironment);
            const replayed = targetBatch(await transport.trace(), captured.requestOrder);
            expect(replayed).toMatchObject({ captureSequence: 1, replayedHistory: true });
            if (!replayed) throw new Error("The post-advance target batch did not replay history.");
            phaseMarkers.push({
              phase: "replay",
              requestOrder: replayed.requestOrder,
              responseOrder: replayed.responseOrder,
              replayedHistory: replayed.replayedHistory,
              captureSequence: replayed.captureSequence,
            });

            await transport.releaseStaleHistory();
            flow("goal-progress-revision-recovered.yaml", newEnvironment);
            const released = targetBatch(await transport.trace(), replayed.requestOrder);
            expect(released).toMatchObject({ replayedHistory: undefined });
            if (!released)
              throw new Error("The post-release target batch did not refresh history.");
            phaseMarkers.push({
              phase: "release",
              requestOrder: released.requestOrder,
              responseOrder: released.responseOrder,
              replayedHistory: released.replayedHistory,
              captureSequence: released.captureSequence,
            });
            expect(phaseMarkers.map((marker) => marker.phase)).toEqual([
              "capture",
              "replay",
              "release",
            ]);
            expect(phaseMarkers.map((marker) => marker.requestOrder)).toEqual(
              [...phaseMarkers.map((marker) => marker.requestOrder)].sort(
                (left, right) => left - right,
              ),
            );
          } finally {
            try {
              trace = await transport.trace();
              writeFileSync(
                testInfo.outputPath("native-goal-transport-revision-trace.json"),
                `${JSON.stringify(trace, null, 2)}\n`,
                { mode: 0o600 },
              );
              writeFileSync(
                testInfo.outputPath("native-goal-transport-revision-phases.json"),
                `${JSON.stringify(phaseMarkers, null, 2)}\n`,
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
      if (!trace) throw new Error("Native revision-mismatch transport trace was not retained.");
      expect(trace.length).toBeLessThanOrEqual(32);
    },
    { profileId: actor.profileId },
  );
});
