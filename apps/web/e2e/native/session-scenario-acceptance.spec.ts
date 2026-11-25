import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { activityPlans, plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
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

  const runFlow = (flow: string) => {
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
    expect(result.error, `Maestro must execute ${flow}`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${flow}`).toBe(0);
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
  runFlow("session-scenario-compare.yaml");
  await expect(fixture.snapshot()).resolves.toEqual(before);

  runFlow("session-scenario-apply.yaml");
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
