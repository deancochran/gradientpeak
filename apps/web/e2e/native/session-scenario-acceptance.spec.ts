import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { activityPlans, plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { runWithNativeScenarioCleanup } from "../support/native-scenario-cleanup";
import { startNativeScenarioTransport } from "../support/native-scenario-transport";
import { createSessionScenarioFixture } from "../support/scenario-fixture";

function requireRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) throw new Error(message);
  return row;
}

test("native athlete compares, cancels, and applies a selected session scenario", async ({
  actorFactory,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(300_000);
  const actor = await actorFactory.create("athlete");
  const fixture = await createSessionScenarioFixture({
    actor,
    database: e2eDatabase,
    e2eData,
    identity: e2eIdentity,
  });
  const [selectedPlan] = await e2eDatabase.db
    .select({ name: activityPlans.name })
    .from(activityPlans)
    .where(eq(activityPlans.id, fixture.activityPlanId));
  if (!selectedPlan) throw new Error("Scenario fixture selected activity plan is missing.");

  const runFlow = (flow: string, screenshots: readonly string[] = []) => {
    for (const screenshot of screenshots)
      rmSync(resolve(process.cwd(), screenshot), { force: true });
    const result = spawnSync(
      "maestro",
      [
        "--udid",
        "emulator-5554",
        "test",
        "--debug-output",
        testInfo.outputPath(`maestro-${flow.replace(".yaml", "")}`),
        `../mobile/.maestro/flows/acceptance/${flow}`,
      ],
      {
        encoding: "utf8",
        timeout: 150_000,
        env: {
          ...process.env,
          MAESTRO_ACCEPTANCE_EMAIL: actor.email,
          MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
          MAESTRO_ACCEPTANCE_PLAN_NAME: selectedPlan.name,
          MAESTRO_ACCEPTANCE_SESSION_DATE: fixture.date,
          MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(fixture.date.slice(8, 10))),
          MAESTRO_ACCEPTANCE_SESSION_ID: fixture.sessionId,
        },
      },
    );
    writeFileSync(
      testInfo.outputPath(`maestro-${flow}.log`),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600 },
    );
    const screenshotDirectory = testInfo.outputPath("maestro-screenshots");
    mkdirSync(screenshotDirectory, { recursive: true, mode: 0o700 });
    for (const screenshot of screenshots) {
      const source = resolve(process.cwd(), screenshot);
      if (existsSync(source)) copyFileSync(source, resolve(screenshotDirectory, screenshot));
    }
    expect(result.error, `Maestro must execute ${flow}`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${flow}`).toBe(0);
    for (const screenshot of screenshots) {
      expect(
        existsSync(resolve(screenshotDirectory, screenshot)),
        `Maestro must retain ${screenshot} for inspection.`,
      ).toBe(true);
    }
  };

  runFlow("session-scenario-signin.yaml");
  const before = await fixture.snapshot();
  const originalSelected = requireRow(
    before[0].find((session) => session.id === fixture.sessionId),
    "Scenario fixture selected session is missing before native interaction.",
  );
  const originalOtherOccurrence = requireRow(
    before[0].find((session) => session.id !== fixture.sessionId),
    "Scenario fixture other occurrence is missing before native interaction.",
  );
  const originalPlan = requireRow(
    before[1].find((plan) => plan.id === fixture.activityPlanId),
    "Scenario fixture selected activity plan is missing before native interaction.",
  );
  expect(originalSelected.activity_plan_id).toBe(fixture.activityPlanId);
  runFlow("session-scenario-compare.yaml", [
    "session-scenario-comparison.png",
    "session-scenario-comparison-legend.png",
    "session-scenario-confirmation.png",
  ]);
  await expect(fixture.snapshot()).resolves.toEqual(before);

  try {
    runFlow("session-scenario-apply.yaml", [
      "session-scenario-success.png",
      "session-scenario-returned-ledger.png",
      "session-scenario-returned-calendar.png",
    ]);
  } catch (error) {
    const [diagnosticSessions, diagnosticPlans] = await fixture.snapshot();
    const diagnosticSelected = diagnosticSessions.find(
      (session) => session.id === fixture.sessionId,
    );
    const diagnosticPlan = diagnosticPlans.find(
      (plan) => plan.id === diagnosticSelected?.activity_plan_id,
    );
    const receipts = await fixture.operationReceiptsForSession(fixture.sessionId);
    writeFileSync(
      testInfo.outputPath("native-scenario-apply-diagnostic.json"),
      JSON.stringify(
        {
          currentPlan: diagnosticPlan
            ? {
                contentVisibility: diagnosticPlan.content_visibility,
                isSystemTemplate: diagnosticPlan.is_system_template,
                ownedByActor: diagnosticPlan.profile_id === actor.profileId,
                differsFromOriginal: diagnosticPlan.id !== fixture.activityPlanId,
              }
            : null,
          receipts: receipts.map((receipt) => ({
            command: receipt.command,
            operationId: "[redacted]",
          })),
          selectedSession: diagnosticSelected
            ? {
                pointsToOriginalPlan:
                  diagnosticSelected.activity_plan_id === fixture.activityPlanId,
                present: true,
              }
            : { present: false },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    throw error;
  }
  const [sessions, plans] = await fixture.snapshot();
  const selected = requireRow(
    sessions.find((session) => session.id === fixture.sessionId),
    "Selected session is missing after native scenario apply.",
  );
  const otherOccurrence = requireRow(
    sessions.find((session) => session.id === originalOtherOccurrence.id),
    "Other occurrence is missing after native scenario apply.",
  );
  const copiedPlan = requireRow(
    plans.find((plan) => plan.id === selected.activity_plan_id),
    "Selected session does not reference a persisted copied activity plan.",
  );
  const unchangedOriginalPlan = requireRow(
    plans.find((plan) => plan.id === fixture.activityPlanId),
    "Original activity plan is missing after native scenario apply.",
  );
  expect(selected.activity_plan_id).not.toBe(fixture.activityPlanId);
  expect(copiedPlan.id).toBe(selected.activity_plan_id);
  expect(copiedPlan.profile_id).toBe(actor.profileId);
  expect(copiedPlan.content_visibility).toBe("private");
  expect(copiedPlan.is_system_template).toBe(false);
  expect(otherOccurrence).toEqual(originalOtherOccurrence);
  expect(unchangedOriginalPlan).toEqual(originalPlan);
  expect(plans).toHaveLength(before[1].length + 1);
  await expect(fixture.operationReceiptsForSession(fixture.sessionId)).resolves.toEqual([
    expect.objectContaining({
      command: "chatbot.planned-sessions.apply-scenario",
      operationId: expect.stringMatching(/^[A-Za-z0-9_-]{32,128}$/),
    }),
  ]);
  await expect(
    e2eDatabase.db
      .select({ id: plannedSessions.id })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.id, fixture.sessionId),
          eq(plannedSessions.profile_id, actor.profileId),
        ),
      ),
  ).resolves.toHaveLength(1);
});

test("native athlete explicitly retries the same scenario request after its committed ACK is lost", async ({
  actorFactory,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(300_000);
  const actor = await actorFactory.create("athlete");
  const fixture = await createSessionScenarioFixture({
    actor,
    database: e2eDatabase,
    e2eData,
    identity: e2eIdentity,
  });
  const [selectedPlan] = await e2eDatabase.db
    .select({ name: activityPlans.name })
    .from(activityPlans)
    .where(eq(activityPlans.id, fixture.activityPlanId));
  if (!selectedPlan) throw new Error("Scenario fixture selected activity plan is missing.");
  const runAdb = (...args: string[]) =>
    spawnSync("adb", ["-s", "emulator-5554", ...args], {
      encoding: "utf8",
      timeout: 30_000,
    });
  const runFlow = (flow: string, screenshots: readonly string[] = []) => {
    for (const screenshot of screenshots)
      rmSync(resolve(process.cwd(), screenshot), { force: true });
    const result = spawnSync(
      "maestro",
      [
        "--udid",
        "emulator-5554",
        "test",
        "--debug-output",
        testInfo.outputPath(`maestro-${flow.replace(".yaml", "")}`),
        `../mobile/.maestro/flows/acceptance/${flow}`,
      ],
      {
        encoding: "utf8",
        timeout: 150_000,
        env: {
          ...process.env,
          MAESTRO_ACCEPTANCE_EMAIL: actor.email,
          MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
          MAESTRO_ACCEPTANCE_PLAN_NAME: selectedPlan.name,
          MAESTRO_ACCEPTANCE_SESSION_DATE: fixture.date,
          MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(fixture.date.slice(8, 10))),
          MAESTRO_ACCEPTANCE_SESSION_ID: fixture.sessionId,
        },
      },
    );
    writeFileSync(
      testInfo.outputPath(`maestro-${flow}.log`),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600 },
    );
    const screenshotDirectory = testInfo.outputPath("maestro-screenshots");
    mkdirSync(screenshotDirectory, { recursive: true, mode: 0o700 });
    for (const screenshot of screenshots) {
      const source = resolve(process.cwd(), screenshot);
      if (existsSync(source)) copyFileSync(source, resolve(screenshotDirectory, screenshot));
    }
    expect(result.error, `Maestro must execute ${flow}`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${flow}`).toBe(0);
    for (const screenshot of screenshots) {
      expect(
        existsSync(resolve(screenshotDirectory, screenshot)),
        `Maestro must retain ${screenshot} for inspection.`,
      ).toBe(true);
    }
  };

  runFlow("session-scenario-signin.yaml");
  const before = await fixture.snapshot();
  const originalSelected = requireRow(
    before[0].find((session) => session.id === fixture.sessionId),
    "Scenario fixture selected session is missing before the lost-ACK flow.",
  );
  const originalOtherOccurrence = requireRow(
    before[0].find((session) => session.id !== fixture.sessionId),
    "Scenario fixture other occurrence is missing before the lost-ACK flow.",
  );
  const originalPlan = requireRow(
    before[1].find((plan) => plan.id === fixture.activityPlanId),
    "Scenario fixture source activity plan is missing before the lost-ACK flow.",
  );
  runFlow("session-scenario-compare.yaml");
  await expect(fixture.snapshot()).resolves.toEqual(before);

  const transport = await startNativeScenarioTransport({ sessionId: fixture.sessionId });
  const transportPort = new URL(transport.origin).port;
  let restoreResult: ReturnType<typeof runAdb> | undefined;
  await runWithNativeScenarioCleanup(
    async () => {
      expect(
        runAdb("reverse", "--remove", "tcp:3100").status,
        "Must remove only the runner-owned API reverse before fault injection.",
      ).toBe(0);
      expect(
        runAdb("reverse", "tcp:3100", `tcp:${transportPort}`).status,
        "Must route the runner-owned API reverse through the leased local transport.",
      ).toBe(0);
      runFlow("session-scenario-lost-ack-apply.yaml", [
        "session-scenario-lost-ack-uncertain.png",
        "session-scenario-lost-ack-returned-ledger.png",
      ]);
      runFlow("session-scenario-lost-ack-retry.yaml", [
        "session-scenario-lost-ack-reopened.png",
        "session-scenario-lost-ack-recovered.png",
      ]);
    },
    {
      restoreReverse: () => {
        restoreResult = runAdb("reverse", "tcp:3100", "tcp:3100");
      },
      stopTransport: () => transport.stop(),
    },
  );
  if (!restoreResult)
    throw new Error("Native scenario cleanup did not attempt API reverse restoration.");
  expect(restoreResult.status, "Must restore the runner-owned API reverse.").toBe(0);

  const transportObservation = JSON.parse(readFileSync(transport.observationPath, "utf8")) as {
    dropped: boolean;
    requests: Array<{ fingerprint: string; operationId: string }>;
  };
  expect(transportObservation.dropped).toBe(true);
  expect(transportObservation.requests).toHaveLength(2);
  const [firstRequest, retriedRequest] = transportObservation.requests;
  expect(firstRequest).toEqual({
    fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    operationId: expect.stringMatching(/^[A-Za-z0-9_-]{32,128}$/),
  });
  expect(retriedRequest).toEqual(firstRequest);
  const [sessions, plans] = await fixture.snapshot();
  const selected = requireRow(
    sessions.find((session) => session.id === fixture.sessionId),
    "Selected session is missing after lost-ACK recovery.",
  );
  const otherOccurrence = requireRow(
    sessions.find((session) => session.id === originalOtherOccurrence.id),
    "Other occurrence is missing after lost-ACK recovery.",
  );
  const copiedPlan = requireRow(
    plans.find((plan) => plan.id === selected.activity_plan_id),
    "Lost-ACK recovery did not retain a persisted copied activity plan.",
  );
  const unchangedOriginalPlan = requireRow(
    plans.find((plan) => plan.id === fixture.activityPlanId),
    "Source activity plan is missing after lost-ACK recovery.",
  );
  expect(selected.activity_plan_id).not.toBe(fixture.activityPlanId);
  expect(copiedPlan.profile_id).toBe(actor.profileId);
  expect(copiedPlan.content_visibility).toBe("private");
  expect(copiedPlan.is_system_template).toBe(false);
  expect(otherOccurrence).toEqual(originalOtherOccurrence);
  expect(unchangedOriginalPlan).toEqual(originalPlan);
  expect(plans).toHaveLength(before[1].length + 1);
  await expect(fixture.operationReceiptsForSession(fixture.sessionId)).resolves.toEqual([
    expect.objectContaining({
      command: "chatbot.planned-sessions.apply-scenario",
      operationId: firstRequest?.operationId,
    }),
  ]);
  await expect(
    e2eDatabase.db
      .select({ id: plannedSessions.id })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.id, fixture.sessionId),
          eq(plannedSessions.profile_id, actor.profileId),
        ),
      ),
  ).resolves.toHaveLength(1);
  expect(originalSelected.activity_plan_id).toBe(fixture.activityPlanId);
});
