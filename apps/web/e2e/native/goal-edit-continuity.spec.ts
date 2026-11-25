import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestInfo } from "@playwright/test";
import { profileGoals } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withGoalFixture } from "../planning/data";
import { retainGoalEditFlowScreenshots } from "./goal-edit-continuity-screenshots";

const flowScreenshots = {
  "goal-edit-cancel.yaml": [
    "goal-edit-detail-before-cancel",
    "goal-edit-invalid-duration",
    "goal-edit-cancelled-detail",
  ],
  "goal-edit-save-reopen.yaml": [
    "goal-edit-repaired-before-save",
    "goal-edit-saved-detail",
    "goal-edit-reopened-detail",
    "goal-edit-original-calendar-date",
  ],
} as const;

type Flow = keyof typeof flowScreenshots;

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

function screenshotPath(root: string, name: string) {
  return join(root, `${name}.png`);
}

function pngDimensions(path: string) {
  const source = readFileSync(path);
  expect(source.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);
  expect(source.toString("ascii", 12, 16)).toBe("IHDR");
  return { height: source.readUInt32BE(20), width: source.readUInt32BE(16) };
}

function prepareFlowScreenshots(testInfo: TestInfo, flow: Flow, debugDirectory: string) {
  mkdirSync(debugDirectory, { recursive: true });
  for (const name of flowScreenshots[flow]) {
    rmSync(screenshotPath(debugDirectory, name), { force: true });
    rmSync(screenshotPath(process.cwd(), name), { force: true });
    rmSync(testInfo.outputPath("goal-edit-continuity-screenshots", `${name}.png`), {
      force: true,
    });
  }
}

function retainFlowScreenshots(testInfo: TestInfo, flow: Flow, debugDirectory: string) {
  return retainGoalEditFlowScreenshots({
    artifactDirectory: testInfo.outputPath("goal-edit-continuity-screenshots"),
    cwdDirectory: process.cwd(),
    debugDirectory,
    names: flowScreenshots[flow],
  });
}

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("Android keeps goal edits cancelable, clearable, and returnable to their selected Calendar date", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel)
    throw new Error(
      "Native goal-edit acceptance requires the runner-provided MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL.",
    );

  const actor = await actorFactory.create("athlete", { label: "native-goal-edit-continuity" });
  const targetDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const goalId = e2eIdentity.uuid("native-goal-edit");
  const title = e2eIdentity.name("Native completion goal");
  const savedTitle = e2eIdentity.name("Native completion goal saved");
  const originalGoal = {
    activityCategory: "run",
    priority: 6,
    targetDate,
    targetPayload: { type: "completion", distance_m: 10_000 },
    title,
  };

  const readDeviceToday = () => {
    const result = spawnSync("adb", ["-s", "emulator-5554", "shell", "date", "+%Y-%m-%d"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(
      result.error,
      "The designated emulator must provide its local Calendar date",
    ).toBeUndefined();
    expect(result.status, "The designated emulator date query must succeed").toBe(0);
    const deviceToday = result.stdout.trim();
    if (!isDateOnly(deviceToday))
      throw new Error(
        `The designated emulator returned an invalid local date: ${JSON.stringify(deviceToday)}.`,
      );
    return deviceToday;
  };

  const runFlow = (flow: Flow, environment: Record<string, string>) => {
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
        { encoding: "utf8", timeout: 180_000, env: { ...process.env, ...environment } },
      );
    } finally {
      retained = retainFlowScreenshots(testInfo, flow, debugDirectory);
    }
    if (!result) throw new Error(`Maestro did not return a result for ${flow}.`);
    writeFileSync(
      testInfo.outputPath(`maestro-${flow.replace(".yaml", "")}.log`),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600 },
    );
    expect(result.error, `Maestro must execute ${flow} on the designated emulator`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${flow}`).toBe(0);
    expect(retained, `Successful ${flow} must retain its declared screenshots`).toEqual([
      ...flowScreenshots[flow],
    ]);
    const artifactDirectory = testInfo.outputPath("goal-edit-continuity-screenshots");
    for (const screenshot of retained)
      expect(pngDimensions(screenshotPath(artifactDirectory, screenshot))).toEqual({
        height: 2400,
        width: 1080,
      });
  };

  await withGoalFixture(
    async (fixture) => {
      const readOwnedGoalAudit = () =>
        e2eDatabase.db
          .select({
            id: profileGoals.id,
            updatedAt: profileGoals.updated_at,
          })
          .from(profileGoals)
          .where(and(eq(profileGoals.id, goalId), eq(profileGoals.profile_id, actor.profileId)));
      fixture.rememberGoal(goalId);
      await e2eDatabase.typedTransaction((transaction) =>
        transaction.insert(profileGoals).values({
          id: goalId,
          profile_id: actor.profileId,
          title,
          target_date: targetDate,
          activity_category: "run",
          priority: 6,
          target_payload: originalGoal.targetPayload,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      );
      await expect.poll(() => fixture.getGoal(goalId)).toEqual(originalGoal);
      const baselineRows = await readOwnedGoalAudit();
      expect(baselineRows).toHaveLength(1);
      const baseline = baselineRows[0];
      if (!baseline)
        throw new Error("The owned goal was absent immediately after its fixture insert.");

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
        MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL: runtimeSentinel,
        MAESTRO_ACCEPTANCE_SAVED_GOAL_TITLE: savedTitle,
        MAESTRO_ACCEPTANCE_TARGET_DATE: targetDate,
        MAESTRO_ACCEPTANCE_TARGET_MONTH_DELTA: String(targetMonthDelta),
      };

      // Keep the established visible synthetic-account sign-in flow unchanged.
      const signIn = spawnSync(
        "maestro",
        [
          "--udid",
          "emulator-5554",
          "test",
          "../mobile/.maestro/flows/acceptance/session-scenario-signin.yaml",
        ],
        { encoding: "utf8", timeout: 180_000, env: { ...process.env, ...environment } },
      );
      writeFileSync(
        testInfo.outputPath("maestro-goal-edit-sign-in.log"),
        `${signIn.stdout ?? ""}\n${signIn.stderr ?? ""}`,
        { mode: 0o600 },
      );
      expect(
        signIn.error,
        "Maestro must execute the established native sign-in flow",
      ).toBeUndefined();
      expect(signIn.status, "See private Maestro sign-in output").toBe(0);

      runFlow("goal-edit-cancel.yaml", environment);
      await expect.poll(() => fixture.getGoal(goalId)).toEqual(originalGoal);
      const canceledRows = await readOwnedGoalAudit();
      expect(canceledRows).toHaveLength(1);
      expect(canceledRows[0]?.updatedAt).toEqual(baseline.updatedAt);

      runFlow("goal-edit-save-reopen.yaml", environment);
      await expect
        .poll(() => fixture.getGoal(goalId))
        .toEqual({
          ...originalGoal,
          targetPayload: { type: "completion", duration_s: 1 },
          title: savedTitle,
        });
    },
    { profileId: actor.profileId },
  );
});
