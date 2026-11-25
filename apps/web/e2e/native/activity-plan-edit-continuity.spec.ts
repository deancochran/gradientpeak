import type { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { activityPlans, plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { clearMaestroCaptures, completeManualNativeAcceptance } from "./current-candidate-support";
import { retainGoalEditFlowScreenshots } from "./goal-edit-continuity-screenshots";

const flowScreenshots = {
  "activity-plan-edit-cancel.yaml": [
    "activity-plan-edit-before",
    "activity-plan-edit-invalid-step",
    "activity-plan-edit-metadata-recovered",
  ],
  "activity-plan-edit-save-reopen.yaml": [
    "activity-plan-edit-saved",
    "activity-plan-edit-reopened",
    "activity-plan-edit-home",
  ],
} as const;

type Flow = keyof typeof flowScreenshots;

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  expect(
    process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim(),
    "Native plan-edit acceptance requires the runner-provided MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL.",
  ).toBeTruthy();
});

test("Android preserves a scheduled plan while canceling an invalid provisional step and saving metadata", async ({
  actorFactory,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(750_000);
  const runtimeSentinel = process.env.MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL?.trim();
  if (!runtimeSentinel) throw new Error("Native plan-edit acceptance requires a runtime sentinel.");
  const actor = await actorFactory.create("athlete", {
    label: "native-activity-plan-edit-continuity",
  });

  // The shared setup is the actual 3876909 workspace journey: it onboards an
  // athlete, creates the V5 60-second rest plan, schedules it, and leaves Home
  // on its selected scheduled day. This acceptance adds only the owned edit
  // continuity boundary; it does not create a second fixture dialect.
  const prepared = await completeManualNativeAcceptance({
    actor,
    e2eDatabase,
    e2eIdentity,
    testInfo,
    workspaceOnly: true,
  });
  const savedPlanName = e2eIdentity.name("Native easy session edited");
  const transientDescription = "Temporary metadata draft";

  const readOwnedPlan = () =>
    e2eDatabase.db
      .select({
        description: activityPlans.description,
        id: activityPlans.id,
        name: activityPlans.name,
        revision: activityPlans.revision,
        structure: activityPlans.structure,
        updatedAt: activityPlans.updated_at,
      })
      .from(activityPlans)
      .where(
        and(eq(activityPlans.id, prepared.plan.id), eq(activityPlans.profile_id, actor.profileId)),
      );
  const readOwnedPlanIds = () =>
    e2eDatabase.db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, actor.profileId));
  const readOwnedSession = () =>
    e2eDatabase.db
      .select({
        activityPlanId: plannedSessions.activity_plan_id,
        activityPlanRevision: plannedSessions.activity_plan_revision,
        id: plannedSessions.id,
        planningDate: plannedSessions.planning_date,
        sessionRevision: plannedSessions.session_revision,
        status: plannedSessions.status,
        updatedAt: plannedSessions.updated_at,
      })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.id, prepared.manualSession.id),
          eq(plannedSessions.profile_id, actor.profileId),
        ),
      );

  const baselinePlans = await readOwnedPlan();
  expect(baselinePlans).toHaveLength(1);
  const baselinePlan = baselinePlans[0];
  if (!baselinePlan) throw new Error("The owned activity plan is missing after native setup.");
  const baselineOwnedPlanIds = await readOwnedPlanIds();
  expect(baselineOwnedPlanIds).toEqual([{ id: prepared.plan.id }]);
  expect(baselinePlan).toMatchObject({
    description: null,
    id: prepared.plan.id,
    name: prepared.planName,
    structure: {
      activity_category: "run",
      items: [
        expect.objectContaining({
          duration: { seconds: 60, type: "time" },
          targets: [{ type: "rest" }],
          type: "step",
        }),
      ],
      version: 5,
    },
  });
  const baselineSessions = await readOwnedSession();
  expect(baselineSessions).toEqual([
    expect.objectContaining({
      activityPlanId: prepared.plan.id,
      id: prepared.manualSession.id,
      planningDate: prepared.today,
      status: "scheduled",
    }),
  ]);
  const baselineSession = baselineSessions[0];
  if (!baselineSession) throw new Error("The scheduled session is missing after native setup.");

  const environment = {
    MAESTRO_ACCEPTANCE_EDITED_PLAN_NAME: savedPlanName,
    MAESTRO_ACCEPTANCE_EMAIL: actor.email,
    MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
    MAESTRO_ACCEPTANCE_PLAN_NAME: prepared.planName,
    MAESTRO_ACCEPTANCE_RUNTIME_SENTINEL: runtimeSentinel,
    MAESTRO_ACCEPTANCE_SESSION_ID: prepared.manualSession.id,
    MAESTRO_ACCEPTANCE_TRANSIENT_DESCRIPTION: transientDescription,
  };
  const runFlow = (flow: Flow) => {
    const captures = flowScreenshots[flow];
    clearMaestroCaptures(captures);
    for (const name of captures)
      rmSync(testInfo.outputPath("activity-plan-edit-continuity-screenshots", `${name}.png`), {
        force: true,
      });
    let result: ReturnType<typeof spawnSync> | undefined;
    let retained: string[] = [];
    try {
      result = prepared.runMaestro(flow, environment);
    } finally {
      retained = retainGoalEditFlowScreenshots({
        artifactDirectory: testInfo.outputPath("activity-plan-edit-continuity-screenshots"),
        cwdDirectory: process.cwd(),
        debugDirectory: testInfo.outputPath("maestro", flow.replace(".yaml", "")),
        names: captures,
      });
    }
    if (!result) throw new Error(`Maestro did not return a result for ${flow}.`);
    writeFileSync(
      testInfo.outputPath(`maestro-${flow.replace(".yaml", "")}.log`),
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600 },
    );
    expect(result.error, `Maestro must execute ${flow} on the designated emulator`).toBeUndefined();
    expect(result.status, `See private Maestro output for ${flow}`).toBe(0);
    expect(retained, `${flow} must retain its declared rendered walkthrough captures`).toEqual([
      ...captures,
    ]);
  };

  runFlow("activity-plan-edit-cancel.yaml");

  // Canceling the invalid, provisional step is a no-op at the durable boundary.
  // The in-memory metadata draft remains on screen until the explicit header Save.
  expect(await readOwnedPlan()).toEqual([baselinePlan]);
  expect(await readOwnedPlanIds()).toEqual(baselineOwnedPlanIds);
  expect(await readOwnedSession()).toEqual([baselineSession]);

  runFlow("activity-plan-edit-save-reopen.yaml");

  const savedPlans = await readOwnedPlan();
  expect(savedPlans).toHaveLength(1);
  expect(savedPlans[0]).toEqual({
    ...baselinePlan,
    description: null,
    name: savedPlanName,
    updatedAt: expect.any(Date),
  });
  // Metadata-only saves intentionally retain the authored V5 structure, stable
  // step identities, and plan revision. The provisional step never reaches it.
  expect(savedPlans[0]?.structure).toEqual(baselinePlan.structure);
  expect(savedPlans[0]?.revision).toBe(baselinePlan.revision);
  expect(await readOwnedPlanIds()).toEqual(baselineOwnedPlanIds);
  expect(await readOwnedSession()).toEqual([baselineSession]);
});
