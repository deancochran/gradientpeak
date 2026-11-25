import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { activityPlans, plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import superjson, { type SuperJSONResult } from "superjson";
import { expect, test } from "../fixtures";
import {
  requireNativeReverseRestoration,
  runWithNativeScenarioCleanup,
} from "../support/native-scenario-cleanup";
import {
  type NativeScenarioTransportObservation,
  startNativeScenarioTransport,
} from "../support/native-scenario-transport";
import { createSessionScenarioFixture } from "../support/scenario-fixture";

function requireRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) throw new Error(message);
  return row;
}

type DurationMetric = {
  status: "complete" | "partial" | "known_zero" | "unavailable";
  value: number | null;
};

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function superjsonResultFrom(value: unknown, message: string): SuperJSONResult {
  const result = requireRecord(value, message);
  if (!("json" in result)) throw new Error(message);
  return result as unknown as SuperJSONResult;
}

function durationMetricFrom(value: unknown, message: string): DurationMetric {
  const metric = requireRecord(value, message);
  if (
    (metric.status !== "complete" &&
      metric.status !== "partial" &&
      metric.status !== "known_zero" &&
      metric.status !== "unavailable") ||
    (metric.value !== null && (typeof metric.value !== "number" || !Number.isFinite(metric.value)))
  ) {
    throw new Error(message);
  }
  return { status: metric.status, value: metric.value };
}

function durationCompositionFrom(value: unknown, message: string) {
  const summary = requireRecord(value, message);
  if (!Array.isArray(summary.categories)) throw new Error(message);
  return {
    categories: summary.categories.map((category, index) => {
      const entry = requireRecord(category, `${message} category ${index} is invalid.`);
      if (typeof entry.activityCategory !== "string")
        throw new Error(`${message} category ${index} has no activity category.`);
      return {
        activityCategory: entry.activityCategory,
        durationSeconds: durationMetricFrom(
          entry.durationSeconds,
          `${message} category ${index} has no duration metric.`,
        ),
      };
    }),
  };
}

async function retainAppliedPlanningLedgerEvidence(input: {
  actor: Parameters<typeof createSessionScenarioFixture>[0]["actor"];
  artifactPath: string;
  date: string;
}) {
  const request = { anchorDate: input.date, period: "day" } as const;
  const encodedInput = encodeURIComponent(JSON.stringify({ 0: { json: request } }));
  const response = await input.actor.request.get(
    `/api/trpc/trainingPlans.getPlanningLedger?batch=1&input=${encodedInput}`,
  );
  expect(response.ok(), `Planning ledger request failed with HTTP ${response.status()}`).toBe(true);
  const body = await response.json();
  if (!Array.isArray(body) || body.length !== 1)
    throw new Error("Planning ledger response was not a single batched tRPC result.");
  const serializedLedger = requireRecord(
    requireRecord(
      requireRecord(body[0], "Planning ledger result is invalid.").result,
      "Planning ledger result is invalid.",
    ).data,
    "Planning ledger result is invalid.",
  );
  const result = requireRecord(
    superjson.deserialize(
      superjsonResultFrom(serializedLedger, "Planning ledger result is invalid."),
    ),
    "Planning ledger response has no JSON result.",
  );
  expect(result).toMatchObject({
    anchorDate: input.date,
    contractVersion: "planning-ledger-v3",
    period: "day",
    periodEnd: input.date,
    periodStart: input.date,
  });
  const composition = requireRecord(
    result.trainingComposition,
    "Planning ledger response has no training composition.",
  );
  const selected = requireRecord(
    composition.selected,
    "Planning ledger response has no selected training composition.",
  );
  const selectedActual = durationCompositionFrom(
    selected.actual,
    "Selected actual training composition is invalid.",
  );
  const selectedPlanned = durationCompositionFrom(
    selected.planned,
    "Selected planned training composition is invalid.",
  );
  writeFileSync(
    input.artifactPath,
    JSON.stringify(
      {
        anchorDate: result.anchorDate,
        contractVersion: result.contractVersion,
        period: result.period,
        periodEnd: result.periodEnd,
        periodStart: result.periodStart,
        trainingComposition: {
          selected: {
            actual: selectedActual,
            planned: selectedPlanned,
          },
        },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  expect(selectedPlanned).toEqual({
    categories: [
      {
        activityCategory: "bike",
        durationSeconds: { status: "complete", value: 1200 },
      },
    ],
  });
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
  await retainAppliedPlanningLedgerEvidence({
    actor,
    artifactPath: testInfo.outputPath("native-scenario-applied-planning-ledger.json"),
    date: fixture.date,
  });
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
  let transportObservation: NativeScenarioTransportObservation | undefined;
  try {
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
          requireNativeReverseRestoration(runAdb("reverse", "tcp:3100", "tcp:3100"));
        },
        stopTransport: () => transport.stop(),
      },
    );
  } finally {
    const observationContents = readFileSync(transport.observationPath, "utf8");
    writeFileSync(
      testInfo.outputPath("native-scenario-transport-observation.json"),
      observationContents,
      {
        mode: 0o600,
      },
    );
    transportObservation = JSON.parse(observationContents) as NativeScenarioTransportObservation;
  }
  if (!transportObservation)
    throw new Error("Native scenario transport observation was not retained.");
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
